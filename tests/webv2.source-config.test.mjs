import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  inspectTvboxConfig,inspectCmsEndpoint,makeCmsRequest,
  tvboxAuditReport,readCmsJsonFilms,probeCms
} from "../src/lib/webv2/source-config-lab.ts";

const client=readFileSync(new URL("../src/components/webv2/source-config-lab.tsx",import.meta.url),"utf8");
const parent=readFileSync(new URL("../src/components/webv2/source-lab-client.tsx",import.meta.url),"utf8");

test("TVBox type 0 XML, type 1 JSON, type 3 Spider, type 4 extended HTTP are not interchangeable",()=>{
  const raw=JSON.stringify({spider:"https://example.org/source.jar",sites:[
    {key:"one",name:"授权JSON",type:1,api:"https://cms.example.org/api.php/provide/vod/"},
    {key:"two",name:"XML站",type:0,api:"https://cms.example.org/api.php/provide/vod/"},
    {key:"three",name:"Spider站",type:3,api:"csp_Test",jar:"https://example.org/spider.jar"},
    {key:"four",name:"扩展HTTP",type:4,api:"https://example.org/extension"},
    {key:"five",name:"依赖解析器",type:1,api:"https://example.org/vod",playUrl:"https://example.org/parse?url="}
  ]});
  const report=inspectTvboxConfig(raw);
  assert.equal(report.ok,true);
  if(!report.ok)return;
  assert.equal(report.total,5);
  assert.deepEqual(report.sites.map(s=>s.kind),
    ["cms-json","cms-xml","spider","extended-http","cms-json"]);
  assert.deepEqual(report.sites.map(s=>s.probeEligible),[true,false,false,false,false]);
  assert.equal(report.sites[2].notes.includes("EXECUTABLE_EXTENSION"),true);
  const text=tvboxAuditReport(report);
  assert.match(text,/eligible_browser_probe=1/);
  assert.doesNotMatch(text,/cms\.example|spider\.jar|parse\?url/);
});
test("duplicate keys, header overrides, dangerous hosts and massive JSON are not eligible",()=>{
  const r=inspectTvboxConfig(JSON.stringify({sites:[
    {key:"repeated",name:"A",type:1,api:"https://example.org/vod"},
    {key:"repeated",name:"B",type:1,api:"https://example.org/vod"},
    {key:"header",name:"特殊来源",type:1,api:"https://example.org/vod",header:{"Referer":"https://example.org/"}},
    {key:"internal",name:"内网",type:1,api:"https://localhost/vod"}
  ]}));
  assert.equal(r.ok,true);
  if(!r.ok)return;
  assert.equal(r.sites.every(s=>!s.probeEligible),true);
  assert.equal(inspectTvboxConfig("not javascript").ok,false);
  assert.deepEqual(inspectTvboxConfig("x".repeat(129000)),{ok:false,code:"TOO_LARGE"});
});
test("CMSEndpoint strips untrusted query credentials and forbids internal/private destinations",()=>{
  const r=inspectCmsEndpoint("https://cms.example.org/api.php/provide/vod/?token=PRIVATE");
  assert.equal(r.ok,true);
  if(r.ok)assert.equal(r.endpoint,"https://cms.example.org/api.php/provide/vod/");
  for(const value of [
    "http://cms.example.org/vod","https://127.0.0.1/vod",
    "https://localhost/vod","https://cms.example.org:8443/vod",
    "https://u:p@cms.example.org/vod","https://[::1]/vod"
  ])assert.equal(inspectCmsEndpoint(value).ok,false,value);
  const s=makeCmsRequest("https://cms.example.org/api.php/provide/vod/","search","  影片  ");
  assert.equal(s.ok,true);
  if(s.ok){
    const u=new URL(s.endpoint);
    assert.equal(u.searchParams.get("ac"),"videolist");
    assert.equal(u.searchParams.get("wd"),"影片");
  }
  const d=makeCmsRequest("https://cms.example.org/api.php/provide/vod/","detail","42");
  assert.equal(d.ok,true);
  if(d.ok)assert.equal(new URL(d.endpoint).searchParams.get("ids"),"42");
});
test("CMS listing normalizes episodes, keeps URLs in volatile state, never executes parser scripts",()=>{
  const films=readCmsJsonFilms({code:1,list:[
    {vod_id:"42",vod_name:"<b>合法影视</b>",vod_year:"2024",
     vod_play_from:"m3u8$$$mp4",
     vod_play_url:"第一集$https://media.example.org/one.m3u8?token=abc#错误$javascript:alert(1)$$$第二集$https://media.example.org/two.mp4"},
    {vod_id:"43",vod_name:"没有直链",vod_play_url:"HTML$https://example.org/player.html"},
    {vod_id:"42",vod_name:"重复"}
  ]});
  assert.equal(films?.length,2);
  assert.equal(films?.[0].title,"合法影视");
  assert.deepEqual(films?.[0].episodes.map(x=>x.format),["hls","mp4"]);
  assert.equal(films?.[1].episodeCount,0);
  assert.equal(readCmsJsonFilms({code:1,items:[]}),null);
  assert.equal(readCmsJsonFilms({code:0,list:[]}),null);
});
test("explicit CMS search uses browser CORS with no credentials, redirects, or backend proxy",async()=>{
  let request=null;
  const fake=async(url,init)=>{
    request={url,init};
    return Response.json({code:1,list:[{vod_id:"42",vod_name:"测试",vod_year:"2026",
      vod_play_url:"正片$https://media.example.org/film.webm"}]});
  };
  const res=await probeCms("https://cms.example.org/vod","search","影视",fake);
  assert.equal(res.ok,true);
  assert.equal(res.count,1);
  assert.equal(res.films[0].episodes[0].format,"webm");
  assert.equal(request.init.credentials,"omit");
  assert.equal(request.init.mode,"cors");
  assert.equal(request.init.redirect,"error");
  assert.equal(request.init.referrerPolicy,"no-referrer");
  assert.equal(new URL(request.url).searchParams.get("wd"),"影视");
});
test("unavailable CORS, huge response, HTML and invalid query fail closed",async()=>{
  const site="https://cms.example.org/vod";
  assert.equal((await probeCms(site,"search","电影",async()=>{throw new TypeError("CORS")})).code,"CORS_OR_NETWORK");
  assert.equal((await probeCms(site,"search","电影",async()=>
    new Response("{}",{headers:{"content-length":"500000"}}))).code,"TOO_LARGE");
  assert.equal((await probeCms(site,"search","电影",async()=>
    new Response("<html>Error</html>"))).code,"INVALID_JSON");
  assert.equal((await probeCms(site,"search","")).code,"INVALID_QUERY");
  assert.equal((await probeCms(site,"detail","bad ID")).code,"INVALID_QUERY");
});
test("all configuration UI and CMS data remain local to private SourceLab and opt-in only",()=>{
  assert.match(client,/inspectTvboxConfig\(rawConfig\)/);
  assert.match(client,/probeCms\(checked.endpoint,"search",keyword,fetch,controller.signal\)/);
  assert.match(client,/onSelectMedia\(episode.mediaUrl\)/);
  assert.match(parent,/SourceConfigLab onSelectMedia=\{fromCmsEpisode\}/);
  assert.doesNotMatch(client,/localStorage|sessionStorage|document.cookie|eval\(|new Function|iframe|\/api\/v2\/sourcehub/);
});
