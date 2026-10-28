import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  inspectTvboxConfig,normalizeTvboxJsonc,tvboxAuditReport,
  inspectRemoteConfigUrl,probeRemoteConfig
} from "../src/lib/webv2/source-config-lab.ts";

const ui=readFileSync(new URL("../src/components/webv2/source-config-lab.tsx",import.meta.url),"utf8");

test("strict JSONC subset preserves https:// inside strings, drops comments and trailing commas without eval",()=>{
  const jsonc=[
    "{","  // URL in comment: https://untrusted.example.org/",
    '  "sites":[ {"key":"one", "name":"完整 JSON URL", "type":1,',
    '    "api":"https://cms.example.org/api.php/provide/vod/",},',
    '    /* ignored Spider config never executed */',
    '    {"key":"spider","type":3,"api":"csp_NotExecuted",},',
    '  ],',
    "}"
  ].join("\n");
  const safe=normalizeTvboxJsonc(jsonc);
  assert.doesNotMatch(safe,/untrusted\.example\.org/);
  assert.match(safe,/https:\/\/cms\.example\.org/);
  const result=inspectTvboxConfig(jsonc);
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.equal(result.total,2);
  assert.equal(result.sites[0].probeEligible,true);
  assert.equal(result.sites[1].kind,"spider");
  assert.deepEqual(inspectTvboxConfig('{"sites":[{"key": dangerousScript() }]}'),{ok:false,code:"NOT_JSON"});
  assert.equal(inspectTvboxConfig('{"sites":[] /* unclosed').ok,false);
});
test("config with 160 real-world-style entries is fully classified, without truncating at 120",()=>{
  const sites=Array.from({length:160},(_,i)=>({
    key:"site_"+i,name:"Site "+i,
    type:i<18?1:3,
    api:i<18?"https://cms.example.org/api.php/provide/vod/":"csp_Spider"
  }));
  const result=inspectTvboxConfig(JSON.stringify({sites}));
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.equal(result.sites.length,160);
  assert.equal(result.sites.filter(x=>x.kind==="cms-json").length,18);
  assert.equal(result.sites.filter(x=>x.probeEligible).length,18);
  assert.equal(result.sites.filter(x=>x.kind==="spider").length,142);
  assert.equal(result.truncated,false);
  assert.doesNotMatch(tvboxAuditReport(result),/cms\.example\.org/);
});
test("multi-repository lists are acknowledged without recursively requesting references",()=>{
  assert.deepEqual(inspectTvboxConfig('{"urls":[{"name":"foo","url":"https://example.org/box.json"}]}'),
    {ok:false,code:"MULTI_REPO_NOT_SUPPORTED"});
});
test("remote URLs forbid query tokens and private/unsafe addresses",()=>{
  assert.equal(inspectRemoteConfigUrl("https://raw.githubusercontent.com/org/repo/main/box.json").ok,true);
  assert.deepEqual(inspectRemoteConfigUrl("https://example.org/box.json?key=SECRET"),
    {ok:false,code:"QUERY_NOT_ALLOWED"});
  for(const value of [
    "http://example.org/box.json","https://localhost/box.json",
    "https://127.0.0.1/box.json","https://10.0.0.15/box.json",
    "https://[::1]/box.json","https://example.org:8443/box.json",
    "https://user:pass@example.org/box.json","https://example.org/a.json#token",
    "file:///etc/passwd","javascript:alert(1)"
  ]) assert.equal(inspectRemoteConfigUrl(value).ok,false,value);
});
test("remote subscription fetch uses browser CORS, no cookies/redirect/referrer, one config only",async()=>{
  let calls=0,observed;
  const transport=async(url,init)=>{
    calls++;observed={url,init};
    const json=JSON.stringify({sites:[
      {key:"a",name:"Safe",type:1,api:"https://cms.example.org/vod"}
    ]});
    return new Response(json,{headers:{"content-type":"text/plain; charset=UTF-8"}});
  };
  const response=await probeRemoteConfig("https://raw.githubusercontent.com/owner/repo/main/config.json",transport);
  assert.equal(response.ok,true);
  if(!response.ok)return;
  assert.equal(response.audit.sites[0].probeEligible,true);
  assert.equal(calls,1);
  assert.equal(observed.init.credentials,"omit");
  assert.equal(observed.init.mode,"cors");
  assert.equal(observed.init.redirect,"error");
  assert.equal(observed.init.referrerPolicy,"no-referrer");
  assert.equal(observed.init.cache,"no-store");
  assert.equal(observed.init.method,"GET");
});
test("remote importer blocks oversize, HTML, redirects, CORS, malformed JSON and recursive lists",async()=>{
  const u="https://example.org/config.json";
  const oversized=await probeRemoteConfig(u,async()=>
    new Response("{}",{headers:{"content-length":"300000"}}));
  assert.deepEqual(oversized,{ok:false,code:"TOO_LARGE"});
  const streamed=await probeRemoteConfig(u,async()=>
    new Response(" ".repeat(128001),{headers:{"content-type":"text/plain"}}));
  assert.deepEqual(streamed,{ok:false,code:"TOO_LARGE"});
  const html=await probeRemoteConfig(u,async()=>
    new Response("<html></html>",{headers:{"content-type":"text/html"}}));
  assert.deepEqual(html,{ok:false,code:"INVALID_CONTENT_TYPE"});
  const redirects=await probeRemoteConfig(u,async()=>new Response(null,{status:302}));
  assert.deepEqual(redirects,{ok:false,code:"HTTP_ERROR"});
  const network=await probeRemoteConfig(u,async()=>{throw new TypeError("CORS")});
  assert.deepEqual(network,{ok:false,code:"CORS_OR_NETWORK"});
  const bad=await probeRemoteConfig(u,async()=>new Response("{something",{
    headers:{"content-type":"application/json"}}));
  assert.deepEqual(bad,{ok:false,code:"NOT_JSON"});
  const multi=await probeRemoteConfig(u,async()=>Response.json({urls:[{name:"x",url:"https://example.org/x"}]}));
  assert.deepEqual(multi,{ok:false,code:"MULTI_REPO_NOT_SUPPORTED"});
});
test("remote owner UI requires explicit button press, uses no server API, clears URLs",()=>{
  assert.match(ui,/onSubmit=\{e=>\{void importRemote\(e\);\}\}/);
  assert.match(ui,/probeRemoteConfig\(remoteUrl,fetch,controller.signal\)/);
  assert.match(ui,/手动读取远程 TVBox 配置/);
  assert.match(ui,/setRemoteUrl\(""\)/);
  assert.match(ui,/只看可手动测试的 JSON HTTP/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie|\/api\/v2\/sourcehub\/import/);
});

test("real-world-like aggregate query variants do not inflate browser-compatible count",()=>{
  const all=Array.from({length:160},(_,i)=>({
    key:"s"+i,
    type:i<18?1:3,
    api:i<9?"https://a"+i+".example.org/api.php/provide/vod/":
      i<18?"https://b"+i+".example.org/api.php/provide/vod/?at=json":"csp_spider"
  }));
  const r=inspectTvboxConfig(JSON.stringify({sites:all}));
  assert.equal(r.ok,true);
  if(!r.ok)return;
  assert.equal(r.sites.filter(s=>s.probeEligible).length,9);
  assert.equal(r.sites.filter(s=>s.notes.includes("API_QUERY_REQUIRES_REVIEW")).length,9);
  assert.match(tvboxAuditReport(r),/query_parameter_review=9/);
});
