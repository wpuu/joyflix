/**
 * Web V2 SourceHub V0: independent, rights-gated normalization layer.
 * No fetch, proxy, arbitrary TVBox script evaluation or legacy-site dependency.
 */
export type SourceKind = "cms-json" | "direct-file";
export type SourceStatus = "pending" | "approved" | "suspended";
export interface SourceApproval {
  rightsHolder: string;
  rightsEvidenceUrl: string;
  permittedUse: "playback";
  expiresOn: string;
  approvedWorkIds: readonly string[];
  // Individually reviewed identity mapping; identical titles alone are NOT proof of same work.
  canonicalWorkIds?: Readonly<Record<string,string>>;
}
export interface SourceDefinition {
  id: string;
  name: string;
  kind: SourceKind;
  endpoint: string;
  allowedApiHost: string;
  allowedMediaHosts: readonly string[];
  status: SourceStatus;
  approval: SourceApproval;
}
export interface Episode {
  index: number;
  label: string;
  mediaUrl: string;
  format: "hls" | "mp4" | "webm";
}
export interface PlayLine {
  id: string;
  name: string;
  episodes: readonly Episode[];
}
export interface SourceFilm {
  key: string;
  sourceId: string;
  workId: string;
  canonicalId: string;
  title: string;
  year: number;
  lines: readonly PlayLine[];
  rights?: {
    credit: string;
    licenseName: string;
    licenseUrl: string;
    evidenceUrl: string;
    filePageUrl: string;
    deliveryNotice: string;
  };
  previewOnly?: boolean;
}
// Production remains closed until a specific work and its delivery rights pass review.
export const APPROVED_SOURCES: readonly SourceDefinition[] = [];
const SOURCE_ID = /^[a-z0-9_-]{2,40}$/i;
const WORK_ID = /^[a-zA-Z0-9_-]{1,96}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const MAX_SOURCE_ROWS = 100;
const MAX_LINES = 12;
const MAX_EPISODES = 200;
function obj(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : null;
}
function cleaned(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/<[^>]{0,200}>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
}
function workId(value: unknown): string | null {
  const id = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return WORK_ID.test(id) ? id : null;
}
function validHost(raw: string): boolean {
  return !!raw && raw.length <= 253 && HOST.test(raw) && raw.includes(".") &&
    !raw.includes("..") && !/^\d+(?:\.\d+){3}$/.test(raw) &&
    !/(^|\.)(?:localhost|local|internal)$/.test(raw) &&
    raw !== "metadata.google.internal";
}
function httpsUrl(value: string): URL | null {
  if (value.length > 1600 || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port && !url.hash && validHost(url.hostname) ? url : null;
  } catch { return null; }
}
function validDate(date: string): boolean {
  return DATE.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z")) &&
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date;
}
export function isSourceApproved(s: SourceDefinition, today: string): boolean {
  const a = s.approval;
  const endpoint = httpsUrl(s.endpoint);
  const evidence = httpsUrl(a.rightsEvidenceUrl);
  if (!validDate(today) || !validDate(a.expiresOn) || a.expiresOn < today) return false;
  if (!SOURCE_ID.test(s.id) || !cleaned(s.name, 100) || s.status !== "approved" ||
      !["cms-json", "direct-file"].includes(s.kind) || !endpoint || !evidence ||
      !a.rightsHolder.trim() || a.permittedUse !== "playback") return false;
  if (!validHost(s.allowedApiHost) || endpoint.hostname !== s.allowedApiHost.toLowerCase()) return false;
  if (s.allowedMediaHosts.length < 1 || s.allowedMediaHosts.length > 20 ||
      s.allowedMediaHosts.some(host => !validHost(host) || host !== host.toLowerCase())) return false;
  if (a.approvedWorkIds.length < 1 || a.approvedWorkIds.length > 500 ||
      a.approvedWorkIds.some(id => !WORK_ID.test(id))) return false;
  const identities = a.canonicalWorkIds ? Object.entries(a.canonicalWorkIds) : [];
  if (identities.length > 500 || identities.some(([id,canonical]) =>
      !a.approvedWorkIds.includes(id) || typeof canonical !== "string" ||
      !/^(?:wd:Q[1-9][0-9]*|own:[a-z0-9_-]{2,80})$/.test(canonical))) return false;
  return true;
}
export function canUseWork(s: SourceDefinition, id: string, today: string): boolean {
  return isSourceApproved(s, today) && s.approval.approvedWorkIds.includes(id);
}
export function validateMediaUrl(
  value: unknown, source: SourceDefinition,
): { url: string; format: Episode["format"] } | null {
  if (typeof value !== "string") return null;
  const url = httpsUrl(value);
  if (!url || !source.allowedMediaHosts.includes(url.hostname)) return null;
  const path = url.pathname.toLowerCase();
  const format = path.endsWith(".m3u8") ? "hls" :
    path.endsWith(".mp4") || path.endsWith(".m4v") ? "mp4" :
    path.endsWith(".webm") ? "webm" : null;
  return format ? {url:url.href, format} : null;
}
function parseLines(raw: Record<string, unknown>, source: SourceDefinition): PlayLine[] {
  const text = typeof raw.vod_play_url === "string" ? raw.vod_play_url : "";
  if (!text || text.length > 250000) return [];
  const groups = text.split("$$$").slice(0, MAX_LINES);
  const labels = typeof raw.vod_play_from === "string"
    ? raw.vod_play_from.split("$$$") : [];
  return groups.flatMap((group, groupIndex): PlayLine[] => {
    const seen = new Set<string>();
    const episodes: Episode[] = [];
    for (const piece of group.split("#").slice(0, MAX_EPISODES)) {
      const separator = piece.indexOf("$");
      if (separator < 0) continue;
      const media = validateMediaUrl(piece.slice(separator + 1), source);
      if (!media || seen.has(media.url)) continue;
      seen.add(media.url);
      episodes.push({
        index: episodes.length + 1,
        label: cleaned(piece.slice(0, separator), 70) || "第" + (episodes.length + 1) + "集",
        mediaUrl: media.url,
        format: media.format
      });
    }
    if (!episodes.length) return [];
    const lineId = cleaned(labels[groupIndex], 32) || "line-" + (groupIndex + 1);
    return [{ id:source.id + ":" + groupIndex, name:lineId, episodes }];
  });
}
/** Only a source owner's explicitly reviewed identity map can merge providers.
 * This is separate from playback license; no name-based merge/false danmaku.
 */
export function canonicalIdForWork(source: SourceDefinition, workId: string): string {
  const assigned = source.approval.canonicalWorkIds?.[workId];
  if (assigned && /^(?:wd:Q[1-9][0-9]*|own:[a-z0-9_-]{2,80})$/.test(assigned)) return assigned;
  return "src:" + source.id + ":" + workId;
}

export interface SourceGroup {
  id: string;
  title: string;
  year: number;
  sourceId: string;
  workId: string;
  sourceCount: number;
  lineCount: number;
  refs: readonly {sourceId:string;workId:string;lineCount:number}[];
}

/** Group only verified shared identities. Unknown titles, different years and
 * unaudited same-title mirrors stay separate to protect later danmaku timeline.
 */
export function groupSourcehubFilms(items: readonly SourceFilm[]): SourceGroup[] {
  const map = new Map<string,{id:string;title:string;year:number;sourceId:string;workId:string;refs:{sourceId:string;workId:string;lineCount:number}[]}>();
  for (const item of items.slice(0,300)) {
    // Make conservative groups for conflicting known years even if mapped IDs match.
    const key = item.canonicalId + "|" + String(item.year);
    let group=map.get(key);
    if(!group){
      group={id:item.canonicalId+"@"+String(item.year),title:item.title,year:item.year,
        sourceId:item.sourceId,workId:item.workId,refs:[]};
      map.set(key,group);
    }
    if(group.refs.some(ref=>ref.sourceId===item.sourceId&&ref.workId===item.workId))continue;
    if(group.refs.length<24)group.refs.push({
      sourceId:item.sourceId,workId:item.workId,lineCount:item.lines.length
    });
  }
  return Array.from(map.values()).slice(0,100).map(g=>({
    id:g.id,title:g.title,year:g.year,sourceId:g.sourceId,workId:g.workId,
    sourceCount:g.refs.length,lineCount:g.refs.reduce((total,r)=>total+r.lineCount,0),
    refs:g.refs
  }));
}

export function normalizeCmsItem(input: unknown, source: SourceDefinition, today: string): SourceFilm | null {
  if (source.kind !== "cms-json" || !isSourceApproved(source, today)) return null;
  const row = obj(input);
  const id = workId(row?.vod_id);
  if (!row || !id || !canUseWork(source, id, today)) return null;
  const title = cleaned(row.vod_name, 160);
  if (!title) return null;
  const yearText = cleaned(row.vod_year, 20);
  const parsedYear = Number(yearText.match(/(?:19|20)\d{2}/)?.[0] || 0);
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 &&
    parsedYear <= 2100 ? parsedYear : 0;
  return {
    key:"source:" + source.id + ":" + id, sourceId:source.id, workId:id,
    canonicalId:canonicalIdForWork(source,id), title, year, lines:parseLines(row, source)
  };
}
/** Known JSON CMS list only: never interpret executable Spider/JAR or XML. */
export function normalizeCmsSearch(payload: unknown, source: SourceDefinition, today: string): SourceFilm[] {
  const rows = obj(payload)?.list;
  if (!Array.isArray(rows) || rows.length > 1000) return [];
  const seen = new Set<string>();
  const output: SourceFilm[] = [];
  for (const raw of rows.slice(0, MAX_SOURCE_ROWS)) {
    const item = normalizeCmsItem(raw, source, today);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    output.push(item);
  }
  return output;
}
/** Return a deterministic URL plan, not a fetch. DNS rebinding/redirect checks are still required in server adapters. */
export function cmsSearchRequest(source: SourceDefinition, query: string, today: string): string | null {
  if (source.kind !== "cms-json" || !isSourceApproved(source, today) ||
      query.trim().length < 1 || query.trim().length > 80) return null;
  const endpoint = httpsUrl(source.endpoint);
  if (!endpoint) return null;
  endpoint.search = "";
  endpoint.searchParams.set("ac","videolist");
  endpoint.searchParams.set("wd",query.trim());
  return endpoint.href;
}

/** Small, bounded CMS transport. Only preapproved sources can reach this call.
 * Server deployments must additionally enforce outbound DNS/egress allowlists
 * before enabling any external source. No media proxy or auth bypass.
 */
export type CmsTransport = (input: string, init: RequestInit) => Promise<Response>;
const MAX_RESPONSE_BYTES = 512000;
export async function readApprovedCmsJson(
  requestUrl: string, transport: CmsTransport = fetch,
): Promise<unknown | null> {
  const request = httpsUrl(requestUrl);
  if (!request) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 4500);
  try {
    const response = await transport(request.href, {
      method: "GET", redirect: "manual", signal: abort.signal,
      headers: {Accept:"application/json"}, cache:"no-store"
    });
    const length = Number(response.headers.get("content-length") || 0);
    if (response.status !== 200 ||
        !/^application\/(?:json|[\w.+-]+\+json)(?:;|$)/i.test(response.headers.get("content-type") || "") ||
        (length && (!Number.isFinite(length) || length > MAX_RESPONSE_BYTES)) ||
        !response.body) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const reader = response.body.getReader();
    let bytes = 0;
    const decoder = new TextDecoder();
    let text = "";
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) return null;
        text += decoder.decode(part.value, {stream:true});
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    try { return JSON.parse(text) as unknown; } catch { return null; }
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export function cmsDetailRequest(
  source: SourceDefinition, id: string, today: string,
): string | null {
  if (source.kind !== "cms-json" || !WORK_ID.test(id) ||
      !canUseWork(source, id, today)) return null;
  const endpoint = httpsUrl(source.endpoint);
  if (!endpoint) return null;
  endpoint.search = "";
  endpoint.searchParams.set("ac", "videolist");
  endpoint.searchParams.set("ids", id);
  return endpoint.href;
}

/** No implicit mirror lookup; empty registry is a deliberate closed state. */
export async function searchSourceHub(
  query: string, today: string, registry: readonly SourceDefinition[] = APPROVED_SOURCES,
  transport: CmsTransport = fetch,
): Promise<SourceFilm[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 80) return [];
  const combined: SourceFilm[] = [];
  const seen = new Set<string>();
  const reviewed = registry.filter(s => s.kind === "cms-json" && isSourceApproved(s, today)).slice(0,3);
  for (const source of reviewed) {
    const request = cmsSearchRequest(source, trimmed, today);
    if (!request) continue;
    const payload = await readApprovedCmsJson(request, transport);
    for (const item of normalizeCmsSearch(payload, source, today)) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      combined.push(item);
    }
  }
  return combined;
}

export async function detailSourceHub(
  sourceId: string, id: string, today: string,
  registry: readonly SourceDefinition[] = APPROVED_SOURCES,
  transport: CmsTransport = fetch,
): Promise<SourceFilm | null> {
  const source = registry.find(s => s.id === sourceId);
  if (!source) return null;
  const request = cmsDetailRequest(source, id, today);
  if (!request) return null;
  const payload = await readApprovedCmsJson(request, transport);
  if (!payload) return null;
  const item = normalizeCmsSearch(payload, source, today).find(x => x.workId === id);
  return item ?? null;
}


/**
 * Hand-reviewed OPEN MOVIE samples in the private Web V2 Preview only.
 * This is not a default production approved-source list, and not a public CDN
 * contract with Wikimedia. Credits and source pages are shown next to player.
 * The 2026-12-31 validity bound is an internal re-review date, not an expiry of
 * Blender's Creative Commons copyright license.
 */
export function previewOpenFilmsEnabled(env:Record<string,string|undefined>):boolean {
  if(env.NODE_ENV==="development" && !env.VERCEL)return true;
  return env.NODE_ENV==="production" && env.VERCEL_ENV==="preview" &&
    env.VERCEL_TARGET_ENV==="preview" &&
    env.VERCEL_PROJECT_ID==="prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX" &&
    env.VERCEL_GIT_COMMIT_REF==="feature/web-v2-migration-20261027";
}

interface OpenFilmRecord {
  source: SourceDefinition;
  id: string;
  title: string;
  searchAliases: readonly string[];
  year: number;
  mediaUrl: string;
  credit: string;
  licenseName: "CC BY 3.0" | "CC BY 4.0";
  licenseUrl: string;
  filePageUrl: string;
}
const COMMONS_HOST="upload.wikimedia.org";
const REVIEW_DATE="2026-12-31";
const openFilmRecords: readonly OpenFilmRecord[]=[
  {
    source:{
      id:"blender-spring",name:"Blender Spring（Commons 展示源）",kind:"direct-file",
      endpoint:"https://upload.wikimedia.org/wikipedia/commons/a/a5/Spring_-_Blender_Open_Movie.webm",
      allowedApiHost:COMMONS_HOST,allowedMediaHosts:[COMMONS_HOST],status:"approved",
      approval:{
        rightsHolder:"Blender Foundation",
        rightsEvidenceUrl:"https://studio.blender.org/projects/spring/pages/about/",
        permittedUse:"playback",expiresOn:REVIEW_DATE,approvedWorkIds:["spring2019"],
        canonicalWorkIds:{"spring2019":"own:blender-spring"}
      }
    },
    id:"spring2019",title:"Spring（春）",
    searchAliases:["spring","春","blender","开放电影"],year:2019,
    mediaUrl:"https://upload.wikimedia.org/wikipedia/commons/a/a5/Spring_-_Blender_Open_Movie.webm",
    credit:"© Blender Foundation | cloud.blender.org/spring",
    licenseName:"CC BY 4.0",licenseUrl:"https://creativecommons.org/licenses/by/4.0/",
    filePageUrl:"https://commons.wikimedia.org/wiki/File:Spring_-_Blender_Open_Movie.webm"
  },
  {
    source:{
      id:"blender-bunny",name:"Blender Big Buck Bunny（Commons 展示源）",kind:"direct-file",
      endpoint:"https://upload.wikimedia.org/wikipedia/commons/8/88/Big_Buck_Bunny_alt.webm",
      allowedApiHost:COMMONS_HOST,allowedMediaHosts:[COMMONS_HOST],status:"approved",
      approval:{
        rightsHolder:"Blender Foundation",
        rightsEvidenceUrl:"https://peach.blender.org/about/",
        permittedUse:"playback",expiresOn:REVIEW_DATE,approvedWorkIds:["bunny2008"],
        canonicalWorkIds:{"bunny2008":"own:blender-big-buck-bunny"}
      }
    },
    id:"bunny2008",title:"Big Buck Bunny（大雄兔）",
    searchAliases:["big buck bunny","bunny","大兔","大雄兔","blender","开放电影"],year:2008,
    mediaUrl:"https://upload.wikimedia.org/wikipedia/commons/8/88/Big_Buck_Bunny_alt.webm",
    credit:"© copyright 2008, Blender Foundation / www.bigbuckbunny.org；展示完整原片片尾署名",
    licenseName:"CC BY 3.0",licenseUrl:"https://creativecommons.org/licenses/by/3.0/",
    filePageUrl:"https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_alt.webm"
  }
];

/** Never fetch media here; output a link only for explicitly reviewed files. */
function normalizeReviewedOpenFilm(row:OpenFilmRecord,today:string):SourceFilm|null {
  if(!isSourceApproved(row.source,today) || row.source.kind!=="direct-file" ||
      !canUseWork(row.source,row.id,today))return null;
  if(row.mediaUrl!==row.source.endpoint)return null;
  const media=validateMediaUrl(row.mediaUrl,row.source);
  if(!media || media.format!=="webm")return null;
  const filePage=httpsUrl(row.filePageUrl);
  const license=httpsUrl(row.licenseUrl);
  if(!filePage || filePage.hostname!=="commons.wikimedia.org" ||
     !license || license.hostname!=="creativecommons.org" ||
     !/^(?:CC BY 3\.0|CC BY 4\.0)$/.test(row.licenseName))return null;
  return {
    key:"source:"+row.source.id+":"+row.id,
    sourceId:row.source.id,workId:row.id,
    canonicalId:canonicalIdForWork(row.source,row.id),
    title:row.title,year:row.year,previewOnly:true,
    lines:[{id:row.source.id+":original",name:"Commons 原片 WebM",
      episodes:[{index:1,label:"完整影片",mediaUrl:media.url,format:media.format}]}],
    rights:{
      credit:row.credit,licenseName:row.licenseName,licenseUrl:license.href,
      evidenceUrl:row.source.approval.rightsEvidenceUrl,filePageUrl:filePage.href,
      deliveryNotice:"仅用于登录保护的个人验收；Wikimedia Commons 并非本站商用 CDN。原片保留片尾字幕，本站未重新编辑。"
    }
  };
}
export function previewOpenFilms(
  env:Record<string,string|undefined>,today:string,
):SourceFilm[] {
  if(!previewOpenFilmsEnabled(env))return [];
  return openFilmRecords.flatMap(row=>{
    const film=normalizeReviewedOpenFilm(row,today);
    return film?[film]:[];
  });
}
export function searchPreviewOpenFilms(
  keyword:string,env:Record<string,string|undefined>,today:string
):SourceFilm[]{
  const query=keyword.normalize("NFKC").toLowerCase().trim();
  if(!query || query.length>80 || !previewOpenFilmsEnabled(env))return [];
  const films=previewOpenFilms(env,today);
  return films.filter(film=>{
    const row=openFilmRecords.find(r=>r.source.id===film.sourceId && r.id===film.workId);
    return film.title.toLowerCase().includes(query) ||
      !!row?.searchAliases.some(alias=>alias.includes(query));
  });
}
export function previewOpenFilmById(
  sourceId:string,workId:string,env:Record<string,string|undefined>,today:string
):SourceFilm|null{
  return previewOpenFilms(env,today)
    .find(item=>item.sourceId===sourceId && item.workId===workId)??null;
}
