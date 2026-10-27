import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";

const home=readFileSync(new URL("../src/app/v2/page.tsx",import.meta.url),"utf8");
const watch=readFileSync(new URL("../src/components/webv2/source-watch-client.tsx",import.meta.url),"utf8");
const player=readFileSync(new URL("../src/components/webv2/source-video-v2.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../src/app/v2/layout.tsx",import.meta.url),"utf8");

test("migration UI is a non-indexable independent SourceHub search",()=>{
  assert.match(shell,/noimageindex:true/);
  assert.match(home,/\/api\/v2\/sourcehub\/search\?keyword=/);
  assert.match(home,/response\.status===503/);
  assert.match(home,/setItems\(\[\]\)/);
  assert.doesNotMatch(home,/wpujoyflix|\/api\/searchstream|\/api\/douban|mock-catalog/);
});
test("playback detail reads the independent API and opt-in before media load",()=>{
  assert.match(watch,/\/api\/v2\/sourcehub\/detail\?/);
  assert.match(watch,/loadRequested&&episode/);
  assert.match(watch,/setLoadRequested\(true\)/);
  assert.match(watch,/onFailure=\{setPlaybackError\}/);
  assert.doesNotMatch(watch,/wpujoyflix|\/api\/detail\b|mediaProxy|fetch\("https?:/);
});
test("hls playback retains original mobile policy, actual advancement and no arbitrary proxy",()=>{
  assert.match(player,/preferNativeHls/);
  assert.match(player,/hlsFailureLabel/);
  assert.match(player,/observedForwardPlayback/);
  assert.match(player,/hls\.loadSource\(url\)/);
  assert.match(player,/hls\?\.destroy\(\)/);
  assert.doesNotMatch(player,/mediaProxy|proxyUrl|bypass|DRM|referer/);
});
