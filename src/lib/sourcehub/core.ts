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
  title: string;
  year: number;
  lines: readonly PlayLine[];
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
    title, year, lines:parseLines(row, source)
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
