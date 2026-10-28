/**
 * Owner-initiated, browser-only TVBox single-repository subscription import.
 * Never fetches referenced sites, streams or Spider scripts, never proxies,
 * redirects, caches, persists or sends configuration to this site's backend.
 */
import {inspectTvboxConfig,type ConfigAudit} from "./source-config-lab";

export type RemoteError =
  | "INVALID_URL"|"PRIVATE_ADDRESS"|"QUERY_NOT_ALLOWED"
  | "CORS_OR_NETWORK"|"CANCELLED"|"TIMEOUT"|"HTTP_ERROR"
  | "TOO_LARGE"|"INVALID_CONTENT_TYPE"|"INVALID_BODY"
  | "NOT_JSON"|"INVALID_STRUCTURE"|"MULTI_REPO_NOT_SUPPORTED";

export type RemoteResult =
  | {ok:true;code:"OK";audit:Extract<ConfigAudit,{ok:true}>;bytes:number}
  | {ok:false;code:RemoteError};

const MAX=128000;
const HOST=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
export function inspectRemoteConfigUrl(raw:string):
  | {ok:true;url:string}
  | {ok:false;code:"INVALID_URL"|"PRIVATE_ADDRESS"|"QUERY_NOT_ALLOWED"} {
  if(typeof raw!=="string" || raw!==raw.trim() || raw.length>1800)
    return {ok:false,code:"INVALID_URL"};
  let url:URL;
  try{url=new URL(raw);}
  catch{return {ok:false,code:"INVALID_URL"};}
  if(url.protocol!=="https:"||!url.hostname||url.username||url.password||
     url.port||url.hash)return {ok:false,code:"INVALID_URL"};
  if(url.search)return {ok:false,code:"QUERY_NOT_ALLOWED"};
  const h=url.hostname.toLowerCase();
  if(!HOST.test(h)||!h.includes(".")||h.includes("..")||
     /^\d+(?:\.\d+){3}$/.test(h) || h==="localhost"||
     h.endsWith(".localhost")||h.endsWith(".local")||
     h.endsWith(".internal")||h==="metadata.google.internal")
    return {ok:false,code:"PRIVATE_ADDRESS"};
  return {ok:true,url:url.href};
}

type Transport=(input:string,init:RequestInit)=>Promise<Response>;
/** User click only. The caller must not supply source URLs through SSR or URLs
 * in the current website's query string.
 */
export async function probeRemoteConfig(
  input:string,transport:Transport=fetch,signal?:AbortSignal
):Promise<RemoteResult>{
  const checked=inspectRemoteConfigUrl(input);
  if(!checked.ok)return checked;
  const ctl=new AbortController();
  const forward=()=>ctl.abort();
  signal?.addEventListener("abort",forward,{once:true});
  const timeout=setTimeout(()=>ctl.abort(),10000);
  try{
    const response=await transport(checked.url,{
      method:"GET",mode:"cors",credentials:"omit",redirect:"error",
      referrerPolicy:"no-referrer",cache:"no-store",
      headers:{Accept:"application/json, text/plain;q=0.9"},signal:ctl.signal
    });
    if(!response.ok){
      await response.body?.cancel().catch(()=>undefined);
      return {ok:false,code:"HTTP_ERROR"};
    }
    const contentType=(response.headers.get("content-type")||"")
      .split(";")[0].toLowerCase().trim();
    if(contentType && !["application/json","text/json","text/plain",
      "application/octet-stream"].includes(contentType)){
      await response.body?.cancel().catch(()=>undefined);
      return {ok:false,code:"INVALID_CONTENT_TYPE"};
    }
    const declared=Number(response.headers.get("content-length")||0);
    if(!Number.isFinite(declared)||declared>MAX){
      await response.body?.cancel().catch(()=>undefined);
      return {ok:false,code:"TOO_LARGE"};
    }
    if(!response.body)return {ok:false,code:"INVALID_BODY"};
    let bytes=0,text="";
    const reader=response.body.getReader();
    const decoder=new TextDecoder("utf-8",{fatal:true});
    try{
      while(true){
        const part=await reader.read();
        if(part.done)break;
        bytes+=part.value.byteLength;
        if(bytes>MAX)return {ok:false,code:"TOO_LARGE"};
        text+=decoder.decode(part.value,{stream:true});
      }
      text+=decoder.decode();
    }finally{await reader.cancel().catch(()=>undefined);}
    const audit=inspectTvboxConfig(text);
    if(!audit.ok)return audit;
    return {ok:true,code:"OK",audit,bytes};
  }catch{
    if(signal?.aborted)return {ok:false,code:"CANCELLED"};
    if(ctl.signal.aborted)return {ok:false,code:"TIMEOUT"};
    return {ok:false,code:"CORS_OR_NETWORK"};
  }finally{
    clearTimeout(timeout);
    signal?.removeEventListener("abort",forward);
  }
}
