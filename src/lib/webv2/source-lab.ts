/** SourceLab V1: client-only diagnostics for owner-supplied permitted media.
 * Never store, persist, log or send the URL to the WPU TV backend. The sole
 * permitted outgoing request is the browser's own media request on opt-in.
 */
export type MediaKind = "hls"|"mp4"|"webm";
export type MediaCandidate =
  | {ok:true;url:string;kind:MediaKind}
  | {ok:false;code:"INVALID_URL"|"PRIVATE_ADDRESS"|"UNSUPPORTED_FORMAT"};

export function inspectSourceLabUrl(raw:string): MediaCandidate {
  if(typeof raw!=="string" || raw.length>1800)return{ok:false,code:"INVALID_URL"};
  const value=raw.trim();
  try{
    const url=new URL(value);
    if(url.protocol!=="https:" || url.username || url.password ||
      url.port || url.hash || !url.hostname || /\s/.test(url.href)) {
      return{ok:false,code:"INVALID_URL"};
    }
    const hostname=url.hostname.toLowerCase();
    if(hostname==="localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname==="metadata.google.internal" || hostname.includes(":") ||
      /^\d+(?:\.\d+){3}$/.test(hostname) || !hostname.includes(".")) {
      return{ok:false,code:"PRIVATE_ADDRESS"};
    }
    const path=url.pathname.toLowerCase();
    const kind: MediaKind|null=path.endsWith(".m3u8")?"hls":
      path.endsWith(".mp4") || path.endsWith(".m4v")?"mp4":
      path.endsWith(".webm")?"webm":null;
    return kind?{ok:true,url:url.href,kind}:{ok:false,code:"UNSUPPORTED_FORMAT"};
  }catch{return{ok:false,code:"INVALID_URL"};}
}

export function sourceLabEnabled(env:Record<string,string|undefined>):boolean {
  if(env.NODE_ENV==="development" && !env.VERCEL)return true;
  return env.NODE_ENV==="production" && env.VERCEL_ENV==="preview" &&
    env.VERCEL_TARGET_ENV==="preview" &&
    env.VERCEL_PROJECT_ID==="prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX" &&
    env.VERCEL_GIT_COMMIT_REF==="feature/web-v2-migration-20261027";
}

export function safeSourceLabErrorCode(value:unknown):string {
  const raw=typeof value==="string"?value:"";
  const match=/^((?:HLS|VIDEO|PLAYER)_[A-Z0-9_]{2,55})(?:：|$)/.exec(raw);
  return match?.[1]??"PLAYER_UNCONFIRMED";
}
export function sourceLabReport(results:{
  started:boolean;format:MediaKind|null;playbackSecondsConfirmed:boolean;
  seek60Confirmed:boolean;durationSeconds:number|null;failureCode:string;
}):string{
  const sec=results.durationSeconds!==null && Number.isFinite(results.durationSeconds)
    && results.durationSeconds>=0 && results.durationSeconds<864000
      ? String(Math.round(results.durationSeconds)) : "UNKNOWN";
  return [
    "WEB_V2_SOURCE_LAB_V1",
    "format="+(results.format||"UNTESTED"),
    "first_frame_2s="+(results.playbackSecondsConfirmed?"PASS":"UNVERIFIED"),
    "seek_60s="+(results.seek60Confirmed?"PASS":"UNVERIFIED"),
    "duration_seconds="+sec,
    "error="+safeSourceLabErrorCode(results.failureCode),
    "status="+(results.started?"STARTED":"NOT_STARTED")
  ].join("\n");
}
