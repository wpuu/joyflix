/**
 * Browser-only TVBox/FongMi JSON configuration triage + CMS V10 JSON probe.
 *
 * Does not execute Spider/JAR/QuickJS, follow redirects, send user input to
 * WPU TV server, persist credentials, proxy video or publish candidate sources.
 * Any actual CMS GET must be initiated by the owner in the browser.
 */
export type MediaKind="hls"|"mp4"|"webm";

export type ConfigKind = "cms-json"|"cms-xml"|"spider"|"extended-http"|"unknown";
export type ConfigIssue = "NOT_JSON"|"INVALID_STRUCTURE"|"MULTI_REPO_NOT_SUPPORTED"|"TOO_LARGE";
export interface TvboxSite {
  key:string;
  name:string;
  kind:ConfigKind;
  probeEligible:boolean;
  notes:readonly string[];
  /** Never include this endpoint in the copyable diagnostic report. */
  endpoint:string|null;
}
export type ConfigAudit =
  | {ok:true;sites:TvboxSite[];total:number;truncated:boolean}
  | {ok:false;code:ConfigIssue};
export type EndpointResult =
  | {ok:true;endpoint:string}
  | {ok:false;code:"INVALID_ENDPOINT"|"PRIVATE_ADDRESS"};

export interface CmsEpisode {
  label:string;
  format:MediaKind;
  mediaUrl:string;
}
export interface CmsFilm {
  id:string;
  title:string;
  year:string;
  episodeCount:number;
  episodes:CmsEpisode[];
}
export type CmsProbeCode =
  | "OK"|"EMPTY"|"INVALID_ENDPOINT"|"INVALID_QUERY"|"TIMEOUT"
  | "CANCELLED"|"CORS_OR_NETWORK"|"HTTP_ERROR"|"TOO_LARGE"
  | "INVALID_JSON"|"UNSUPPORTED_SCHEMA";
export type CmsProbe =
  | {ok:true;code:"OK"|"EMPTY";films:CmsFilm[];count:number}
  | {ok:false;code:Exclude<CmsProbeCode,"OK"|"EMPTY">;films:[];count:0};

const SOURCE_MAX=128000;
const BODY_MAX=450000;
const HOST_RE=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const WORK_ID=/^[a-zA-Z0-9_-]{1,96}$/;
function object(raw:unknown):Record<string,unknown>|null {
  return raw!==null && typeof raw==="object" && !Array.isArray(raw)
    ? raw as Record<string,unknown> : null;
}
function textValue(raw:unknown,max=80):string {
  return typeof raw==="string"
    ? raw.replace(/<[^>]{0,200}>/g,"").replace(/[\u0000-\u001f\u007f]/g," ")
      .replace(/\s+/g," ").trim().slice(0,max) : "";
}
function hasValue(raw:unknown):boolean {
  if(raw===null || raw===undefined || raw===false || raw==="")return false;
  if(Array.isArray(raw))return raw.length>0;
  if(typeof raw==="object")return Object.keys(raw).length>0;
  return true;
}

/** Private networks, IP literals, credentials, ports and fragments are not
 * acceptable. Query params in pasted endpoint are intentionally discarded:
 * credentials in source config are not accepted, even if the API needs them.
 */
export function inspectCmsEndpoint(raw:string):EndpointResult {
  if(typeof raw!=="string" || raw.length>1800 || raw!==raw.trim())
    return {ok:false,code:"INVALID_ENDPOINT"};
  try {
    const url=new URL(raw);
    if(url.protocol!=="https:" || !url.hostname || url.username || url.password ||
      url.port || url.hash) return {ok:false,code:"INVALID_ENDPOINT"};
    const host=url.hostname.toLowerCase();
    if(!HOST_RE.test(host) || !host.includes(".") || host.includes("..") ||
      /^\d+(?:\.\d+){3}$/.test(host) || host==="localhost" ||
      host.endsWith(".local") || host.endsWith(".localhost") ||
      host.endsWith(".internal") || host==="metadata.google.internal") {
      return {ok:false,code:"PRIVATE_ADDRESS"};
    }
    // This interface intentionally does not copy embedded credentials, flags
    // or access tokens from arbitrary TVBox configuration endpoints.
    url.search="";
    return {ok:true,endpoint:url.href};
  }catch{return {ok:false,code:"INVALID_ENDPOINT"};}
}


/** Safe JSONC subset. Removes // and /* * / comments and trailing commas;
 * strings (including https://) are preserved, no arbitrary JS is evaluated.
 */
export function normalizeTvboxJsonc(input:string):string{
  let out="",str=false,esc=false;
  for(let i=0;i<input.length;i++){
    const c=input[i],n=input[i+1];
    if(str){
      out+=c;
      if(esc)esc=false;
      else if(c==="\\")esc=true;
      else if(c==='"')str=false;
    }else if(c==='"'){str=true;out+=c;}
    else if(c==="/"&&n==="/"){
      i+=2;
      while(i<input.length&&input[i]!=="\n"&&input[i]!=="\r")i++;
      out+="\n";i--;
    }else if(c==="/"&&n==="*"){
      i+=2;
      let closed=false;
      while(i<input.length-1){
        if(input[i]==="*"&&input[i+1]==="/"){closed=true;i++;break;}
        i++;
      }
      if(!closed)throw Error("unclosed-comment");
      out+=" ";
    }else out+=c;
  }
  if(str)throw Error("unclosed-string");
  let normalized="",quoted=false,escaped=false;
  for(let i=0;i<out.length;i++){
    const c=out[i];
    if(quoted){
      normalized+=c;
      if(escaped)escaped=false;
      else if(c==="\\")escaped=true;
      else if(c==='"')quoted=false;
    }else if(c==='"'){quoted=true;normalized+=c;}
    else if(c===","){
      let next=i+1;
      while(next<out.length&&/\s/.test(out[next]))next++;
      if(out[next]!=="]"&&out[next]!=="}")normalized+=c;
    }else normalized+=c;
  }
  return normalized;
}

export function inspectTvboxConfig(raw:string):ConfigAudit {
  if(typeof raw!=="string" || raw.length>SOURCE_MAX)
    return {ok:false,code:"TOO_LARGE"};
  let parsed:unknown;
  try { parsed=JSON.parse(normalizeTvboxJsonc(raw.replace(/^\uFEFF/,""))); }
  catch { return {ok:false,code:"NOT_JSON"}; }
  const root=object(parsed);
  const rows=Array.isArray(parsed)?parsed:root?.sites;
  if(!Array.isArray(rows)&&Array.isArray(root?.urls))
    return {ok:false,code:"MULTI_REPO_NOT_SUPPORTED"};
  if(!Array.isArray(rows) || rows.length>3000)
    return {ok:false,code:"INVALID_STRUCTURE"};
  const duplicate=new Set<string>(),used=new Set<string>();
  const sites:TvboxSite[]=[];
  for(const value of rows.slice(0,300)){
    const row=object(value);
    if(!row)continue;
    const key=textValue(row.key,50);
    const name=textValue(row.name,70)||"未命名站点";
    const type=row.type===undefined?0:row.type;
    const kind:ConfigKind=type===0?"cms-xml":type===1?"cms-json":
      type===3?"spider":type===4?"extended-http":"unknown";
    const notes:string[]=[];
    if(kind!=="cms-json")notes.push(
      kind==="cms-xml"?"XML_HTTP_NOT_SUPPORTED":
      kind==="spider"?"SPIDER_EXECUTION_NOT_SUPPORTED":
      kind==="extended-http"?"EXTENDED_HTTP_NOT_SUPPORTED":"UNKNOWN_TYPE"
    );
    if(!key || used.has(key))notes.push(used.has(key)?"DUPLICATE_KEY":"INVALID_KEY");
    if(row.searchable===0 || row.searchable===false)notes.push("SEARCH_DISABLED");
    if(hasValue(row.jar) || hasValue(row.click))notes.push("EXECUTABLE_EXTENSION");
    if(hasValue(row.playUrl) || hasValue(row.ext) || hasValue(row.header))
      notes.push("EXTERNAL_PARSER_OR_HEADERS");
    const endpoint=typeof row.api==="string"?inspectCmsEndpoint(row.api):{ok:false as const,code:"INVALID_ENDPOINT" as const};
    if(!endpoint.ok)notes.push("ENDPOINT_UNSUPPORTED");
    if(key && used.has(key))duplicate.add(key);
    if(key)used.add(key);
    sites.push({
      key,name,kind,
      probeEligible:kind==="cms-json" && notes.length===0 && endpoint.ok,
      notes,
      endpoint:endpoint.ok?endpoint.endpoint:null
    });
  }
  // Duplicated site keys never become automatically "safe" through row ordering.
  for(const site of sites) {
    if(duplicate.has(site.key) && !site.notes.includes("DUPLICATE_KEY")){
      site.notes=[...site.notes,"DUPLICATE_KEY"];
      site.probeEligible=false;
    }
  }
  return {ok:true,sites,total:rows.length,truncated:rows.length>300};
}

export function tvboxAuditReport(audit:ConfigAudit):string {
  if(!audit.ok)return "TVBOX_CONFIG_AUDIT_V1\nstatus="+audit.code;
  const count=(kind:ConfigKind)=>audit.sites.filter(s=>s.kind===kind).length;
  return [
    "TVBOX_CONFIG_AUDIT_V1",
    "status=ANALYZED",
    "sites="+audit.total,
    "sampled="+audit.sites.length,
    "json_http="+count("cms-json"),
    "xml_http="+count("cms-xml"),
    "spider="+count("spider"),
    "extended_http="+count("extended-http"),
    "eligible_browser_probe="+audit.sites.filter(s=>s.probeEligible).length,
    "truncated="+(audit.truncated?"YES":"NO"),
    "rights_and_playback=UNVERIFIED"
  ].join("\n");
}

export type CmsRequestKind="search"|"detail";
export function makeCmsRequest(
  endpoint:string,kind:CmsRequestKind,argument:string
):EndpointResult {
  const checked=inspectCmsEndpoint(endpoint);
  if(!checked.ok)return checked;
  const value=argument.trim();
  if(kind==="search" && (!value || value.length>80))
    return {ok:false,code:"INVALID_ENDPOINT"};
  if(kind==="detail" && !WORK_ID.test(value))
    return {ok:false,code:"INVALID_ENDPOINT"};
  const url=new URL(checked.endpoint);
  url.searchParams.set("ac",kind==="search"?"videolist":"detail");
  url.searchParams.set(kind==="search"?"wd":"ids",value);
  return {ok:true,endpoint:url.href};
}
/** Resolve only direct browser media. Never decode JS players, execute Spider
 * or turn a web page into an imaginary MP4/HLS file.
 */
function inspectCmsMediaUrl(raw:string):
  | {ok:true;url:string;kind:MediaKind}
  | {ok:false} {
  if(typeof raw!=="string" || raw.length>1800)return {ok:false};
  try{
    const video=new URL(raw);
    if(video.protocol!=="https:"||video.username||video.password||
      video.port||video.hash)return {ok:false};
    const host=inspectCmsEndpoint(video.origin+video.pathname);
    if(!host.ok)return {ok:false};
    const pathname=video.pathname.toLowerCase();
    const kind:MediaKind|null=pathname.endsWith(".m3u8")?"hls":
      pathname.endsWith(".mp4")||pathname.endsWith(".m4v")?"mp4":
      pathname.endsWith(".webm")?"webm":null;
    return kind?{ok:true,url:video.href,kind}:{ok:false};
  }catch{return {ok:false};}
}
export function readCmsJsonFilms(payload:unknown):CmsFilm[]|null {
  const root=object(payload);
  if(!root || !Array.isArray(root.list) || root.list.length>1000)
    return null;
  if(typeof root.code==="number" && root.code!==1 && root.code!==200)
    return null;
  const out:CmsFilm[]=[];
  const ids=new Set<string>();
  for(const input of root.list.slice(0,30)){
    const row=object(input);
    if(!row)continue;
    const id=typeof row.vod_id==="number"||typeof row.vod_id==="string"
      ? String(row.vod_id):"";
    const title=textValue(row.vod_name,140);
    if(!WORK_ID.test(id)||!title||ids.has(id))continue;
    ids.add(id);
    const episodes:CmsEpisode[]=[];
    const raw=typeof row.vod_play_url==="string"?row.vod_play_url:"";
    if(raw.length<=180000){
      for(const line of raw.split("$$$").slice(0,8)){
        for(const entry of line.split("#").slice(0,80)){
          const index=entry.indexOf("$");
          if(index===-1)continue;
          const result=inspectCmsMediaUrl(entry.slice(index+1));
          if(!result.ok)continue;
          episodes.push({
            label:textValue(entry.slice(0,index),55)||"第"+(episodes.length+1)+"集",
            format:result.kind,mediaUrl:result.url
          });
          if(episodes.length>=60)break;
        }
        if(episodes.length>=60)break;
      }
    }
    out.push({
      id,title,year:textValue(row.vod_year,18).slice(0,4),
      episodeCount:episodes.length,episodes
    });
  }
  return out;
}

type Transport=(input:string,init:RequestInit)=>Promise<Response>;
const bad=(code:Exclude<CmsProbeCode,"OK"|"EMPTY">):CmsProbe=>
  ({ok:false,code,films:[],count:0});
/** Consent-gated direct browser CORS GET. Never use a server-side proxy.
 * The caller must only invoke on actual user click.
 */
export async function probeCms(
  endpoint:string,kind:CmsRequestKind,argument:string,
  transport:Transport=fetch,signal?:AbortSignal
):Promise<CmsProbe>{
  if(kind==="search" && (!argument.trim() || argument.trim().length>80))
    return bad("INVALID_QUERY");
  if(kind==="detail" && !WORK_ID.test(argument.trim()))
    return bad("INVALID_QUERY");
  const req=makeCmsRequest(endpoint,kind,argument);
  if(!req.ok)return bad("INVALID_ENDPOINT");
  const abort=new AbortController();
  const forward=()=>abort.abort();
  signal?.addEventListener("abort",forward,{once:true});
  const timer=setTimeout(()=>abort.abort(),9000);
  try{
    const res=await transport(req.endpoint,{
      method:"GET",mode:"cors",credentials:"omit",redirect:"error",
      referrerPolicy:"no-referrer",cache:"no-store",
      headers:{Accept:"application/json"},signal:abort.signal
    });
    if(!res.ok){
      await res.body?.cancel().catch(()=>undefined);
      return bad("HTTP_ERROR");
    }
    const length=Number(res.headers.get("content-length")||0);
    if(!Number.isFinite(length)||length>BODY_MAX) {
      await res.body?.cancel().catch(()=>undefined);
      return bad("TOO_LARGE");
    }
    if(!res.body)return bad("INVALID_JSON");
    const reader=res.body.getReader();
    const decoder=new TextDecoder();
    let text="",size=0;
    try{
      while(true){
        const part=await reader.read();
        if(part.done)break;
        size+=part.value.byteLength;
        if(size>BODY_MAX)return bad("TOO_LARGE");
        text+=decoder.decode(part.value,{stream:true});
      }
      text+=decoder.decode();
    }finally{await reader.cancel().catch(()=>undefined);}
    let data:unknown;
    try{data=JSON.parse(text);}catch{return bad("INVALID_JSON");}
    const films=readCmsJsonFilms(data);
    if(!films)return bad("UNSUPPORTED_SCHEMA");
    return {ok:true,code:films.length?"OK":"EMPTY",films,count:films.length};
  }catch{
    if(signal?.aborted)return bad("CANCELLED");
    if(abort.signal.aborted)return bad("TIMEOUT");
    return bad("CORS_OR_NETWORK");
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener("abort",forward);
  }
}
