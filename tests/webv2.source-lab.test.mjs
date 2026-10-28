import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  inspectSourceLabUrl,sourceLabEnabled,safeSourceLabErrorCode,sourceLabReport
} from "../src/lib/webv2/source-lab.ts";
const page=readFileSync(new URL("../src/app/v2/qa/source-lab/page.tsx",import.meta.url),"utf8");
const client=readFileSync(new URL("../src/components/webv2/source-lab-client.tsx",import.meta.url),"utf8");

test("direct URL test supports known media types without server-side scraping",()=>{
  for(const [url,expected] of [
    ["https://video.example.org/test.m3u8?token=abcdef","hls"],
    ["https://video.example.org/movie.mp4","mp4"],
    ["https://video.example.org/movie.m4v","mp4"],
    ["https://video.example.org/film.webm","webm"]
  ]){
    const result=inspectSourceLabUrl(url);
    assert.equal(result.ok,true);
    assert.equal(result.kind,expected);
  }
});
test("rejects invalid/private/script/unsupported URLs",()=>{
  for(const url of [
    "http://video.example.org/a.mp4",
    "https://localhost/a.m3u8",
    "https://127.0.0.1/a.mp4",
    "https://10.0.0.9/a.m3u8",
    "https://metadata.google.internal/a.mp4",
    "https://video.example.org:8443/a.mp4",
    "https://user:pass@video.example.org/a.mp4",
    "https://video.example.org/a.mp4#fragment",
    "file:///etc/passwd","javascript:alert(1)",
    "https://video.example.org/page.html","https://video.example.org/a.mp4/playlist",
    "https://[::1]/a.mp4"
  ]) assert.equal(inspectSourceLabUrl(url).ok,false,url);
});
test("QA route fails closed on production, other Vercel project or unknown branch",()=>{
  const good={
    NODE_ENV:"production",VERCEL:"1",VERCEL_ENV:"preview",VERCEL_TARGET_ENV:"preview",
    VERCEL_PROJECT_ID:"prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX",
    VERCEL_GIT_COMMIT_REF:"feature/web-v2-migration-20261027"
  };
  assert.equal(sourceLabEnabled(good),true);
  assert.equal(sourceLabEnabled({...good,VERCEL_ENV:"production"}),false);
  assert.equal(sourceLabEnabled({...good,VERCEL_PROJECT_ID:"prj_EUzmQpHGHpDZy6VDHZ2ao8LInC10"}),false);
  assert.equal(sourceLabEnabled({...good,VERCEL_GIT_COMMIT_REF:"main"}),false);
  assert.equal(sourceLabEnabled({NODE_ENV:"production"}),false);
  assert.equal(sourceLabEnabled({NODE_ENV:"development"}),true);
  assert.match(page,/notFound\(\)/);
  assert.match(page,/sourceLabEnabled\(process\.env\)/);
  assert.match(page,/noimageindex:true/);
});
test("diagnostic report never contains token, query string, URL or raw error",()=>{
  const raw="HLS_MANIFEST_HTTP_403：url https://video.example.org/path.m3u8?token=SECRET";
  assert.equal(safeSourceLabErrorCode(raw),"HLS_MANIFEST_HTTP_403");
  assert.equal(safeSourceLabErrorCode("https://site.example/path?token=KEY"),"PLAYER_UNCONFIRMED");
  const report=sourceLabReport({
    started:true,format:"hls",playbackSecondsConfirmed:true,
    seek60Confirmed:false,durationSeconds:464.2,failureCode:raw
  });
  assert.match(report,/first_frame_2s=PASS/);
  assert.match(report,/seek_60s=UNVERIFIED/);
  assert.match(report,/duration_seconds=464/);
  assert.match(report,/error=HLS_MANIFEST_HTTP_403/);
  assert.doesNotMatch(report,/SECRET|token|video\.example\.org|https:/);
});
test("client performs direct browser media playback only after explicit opt-in",()=>{
  assert.match(client,/inspectSourceLabUrl\(urlText\)/);
  assert.match(client,/setSelected\(\{url:checked\.url/);
  assert.match(client,/selected\?\(/);
  assert.match(client,/preload="none"/);
  assert.match(client,/observedForwardPlayback/);
  assert.match(client,/hlsFailureLabel/);
  assert.match(client,/Hls\.isSupported\(\)/);
  assert.match(client,/sourceLabReport/);
  assert.doesNotMatch(client,/localStorage|sessionStorage|\/api\/(?:proxy|source|video)|fetch\(|XMLHttpRequest/);
});
