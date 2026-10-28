/**
 * TV129 strictly read-only HTTP/CORS compatibility audit from REAL Chrome.
 *
 * Pinned public TVBox config; exactly one harmless unmatched CMS keyword
 * request to each of the nine query-free JSON sources, never fetching videos,
 * details, segments, Spider/JAR/Python or local/private network addresses.
 * Do not log URLs, response bodies, media, cookies, IPs or signed tokens.
 * Source metadata and legal rights are NOT verified by this script.
 */
import {createServer} from "node:http";
import {once} from "node:events";
import dns from "node:dns/promises";
import {createRequire} from "node:module";
const require=createRequire("/tmp/web-v2-selenium/package.json");
const {Builder}=require("selenium-webdriver");
const chrome=require("selenium-webdriver/chrome");

const PINNED="https://raw.githubusercontent.com/TVboxorg/TVbox/0bb8a8061b41dd79276a601830f854792f5e348a/dist/official.json";
const APPROVED_HOSTS=new Set([
  "lzizy1.com","caiji.qhzyapi.com","www.huyaapi.com",
  "mv.wogg.link","cj.rycjapi.com","taopianapi.com",
  "hhzyapi.com","bfzyapi.com","suoniapi.com"
]);
const TEST_KEYWORD="__wpuu_tv129_readonly_probe_20261028_nonexistent__";
function validV4(addr){
  const a=addr.split(".").map(Number);
  if(a.length!==4||a.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  if(a[0]===0||a[0]===10||a[0]===127||a[0]>=224)return false;
  if(a[0]===169&&a[1]===254)return false;
  if(a[0]===172&&a[1]>=16&&a[1]<=31)return false;
  if(a[0]===192&&a[1]===168)return false;
  if(a[0]===100&&a[1]>=64&&a[1]<=127)return false;
  if(a[0]===198&&(a[1]===18||a[1]===19))return false;
  if(a[0]===192&&a[1]===0&&[0,2].includes(a[2]))return false;
  if(a[0]===198&&a[1]===51&&a[2]===100)return false;
  if(a[0]===203&&a[1]===0&&a[2]===113)return false;
  return true;
}
const res=await fetch(PINNED,{redirect:"error",signal:AbortSignal.timeout(14000)});
if(!res.ok)throw Error("Pinned config fetch was not 200");
const body=await res.text();
if(body.length>128000)throw Error("Pinned config exceeds 128k");
const config=JSON.parse(body);
if(!Array.isArray(config.sites)||config.sites.length!==160)
  throw Error("Unexpected pinned config site count");
const sourceList=config.sites.filter(x=>
  x.type===1&&typeof x.api==="string"&&
  x.api.startsWith("https://")&&
  !x.header&&!x.jar&&!x.ext&&!x.playUrl&&!x.click&&x.searchable!==0
);
if(sourceList.length!==15)throw Error("Unexpected query-free audit baseline");
const noQuery=sourceList.filter(x=>{
  try{
    const u=new URL(x.api);
    return !u.search&&!u.hash&&!u.username&&!u.password&&!u.port &&
      APPROVED_HOSTS.has(u.hostname)&&u.protocol==="https:";
  }catch{return false;}
});
if(noQuery.length!==9)throw Error("Query-free candidate count changed");

const server=createServer((_req,response)=>{
  response.writeHead(200,{"content-type":"text/html;charset=utf-8","Cache-Control":"no-store"});
  response.end("<!doctype html><html><head><meta charset=utf-8></head><body><h1>TV129 empty browser origin, no video</h1></body></html>");
});
server.listen(0,"127.0.0.1");
await once(server,"listening");
const port=server.address().port;
let driver;
const results=[];
try{
  const opts=new chrome.Options().addArguments(
    "--headless=new","--no-sandbox","--disable-dev-shm-usage",
    "--disable-extensions","--disable-sync","--window-size=780,500");
  driver=await new Builder().forBrowser("chrome").setChromeOptions(opts).build();
  await driver.manage().setTimeouts({pageLoad:12000,script:30000,implicit:0});
  await driver.get("http://127.0.0.1:"+port+"/");
  for(let i=0;i<noQuery.length;i++){
    const source=noQuery[i],safeId="C"+String(i+1).padStart(2,"0");
    const siteUrl=new URL(source.api);
    let dnsSafe=false;
    try{
      const addresses=await dns.lookup(siteUrl.hostname,{family:4,all:true});
      dnsSafe=addresses.length>0 && addresses.every(x=>validV4(x.address));
    }catch{}
    if(!dnsSafe){
      results.push({id:safeId,outcome:"DNS_UNVERIFIED",json:false,bodyBytes:0});
      continue;
    }
    siteUrl.searchParams.set("ac","videolist");
    siteUrl.searchParams.set("wd",TEST_KEYWORD);
    const response=await driver.executeAsyncScript(
      function(input,callback){
        const ctl=new AbortController();
        const timer=setTimeout(()=>ctl.abort(),6500);
        const result={outcome:"CORS_OR_NETWORK",json:false,bodyBytes:0};
        (async()=>{
          let response;
          try{
            response=await fetch(input,{
              method:"GET",mode:"cors",credentials:"omit",redirect:"error",
              referrerPolicy:"no-referrer",cache:"no-store",
              headers:{Accept:"application/json"},signal:ctl.signal
            });
            result.outcome=response.status===200?"HTTP_200":"HTTP_OTHER";
            if(response.status!==200){await response.body?.cancel();return;}
            const content=(response.headers.get("content-type")||"").toLowerCase();
            const declared=Number(response.headers.get("content-length")||"0");
            result.json=content.includes("json");
            if(declared>16384){result.outcome="BODY_TOO_LARGE";await response.body?.cancel();return;}
            if(!response.body){result.outcome="EMPTY_BODY";return;}
            const reader=response.body.getReader();
            let sum=0,head="";
            try{
              while(sum<16384){
                const {done,value}=await reader.read();
                if(done||!value)break;
                const take=value.subarray(0,16384-sum);
                sum+=take.length;
                head+=new TextDecoder("utf-8",{fatal:false}).decode(take);
              }
            }finally{await reader.cancel().catch(()=>{});}
            result.bodyBytes=sum;
            if(result.json && /"list"\s*:/.test(head))result.outcome="CORS_JSON_CMS_ENVELOPE";
            else if(result.json)result.outcome="CORS_JSON_OTHER";
            else if(/^\s*</.test(head))result.outcome="CORS_HTML_NOT_JSON";
            else result.outcome="CORS_OTHER_CONTENT";
          }catch(e){
            result.outcome=ctl.signal.aborted?"TIMEOUT":"CORS_OR_NETWORK";
          }finally{clearTimeout(timer);}
        })().then(()=>callback(result),()=>callback({outcome:"EXCEPTION",json:false,bodyBytes:0}));
      },siteUrl.href);
    results.push({id:safeId,sourceKey:source.key, outcome:response.outcome,
      json:response.json,bodyBytes:response.bodyBytes});
    console.log(JSON.stringify(results[results.length-1]));
  }
}finally{
  try{await driver?.quit()}catch{}
  await new Promise(resolve=>server.close(resolve));
}
const counts=Object.fromEntries([...new Set(results.map(x=>x.outcome))].map(k=>[k,results.filter(x=>x.outcome===k).length]));
const result={
  pinnedConfig:"TVboxorg/TVbox@0bb8a8061b41dd79276a601830f854792f5e348a",
  totalConfigSites:config.sites.length, jsonHttpCandidates:sourceList.length,
  queryParamReview:sourceList.length-noQuery.length, safeProbeCount:noQuery.length,
  completed:results.length, categories:counts, realChrome:true,
  videoRequests:0, externalFilmMetadataSaved:false,
  commercialRightsVerified:false,
  conclusion:"CORS/HTTP behavior only; not content playback or usage permission"
};
console.log("TV129_PUBLIC_JSON_HTTP_AUDIT "+JSON.stringify(result));
if(results.length!==9)process.exitCode=2;
