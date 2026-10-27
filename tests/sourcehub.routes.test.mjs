import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const search=readFileSync(new URL("../src/app/api/v2/sourcehub/search/route.ts",import.meta.url),"utf8");
const detail=readFileSync(new URL("../src/app/api/v2/sourcehub/detail/route.ts",import.meta.url),"utf8");
test("new V2 routes depend on independent SourceHub only, never old JoyFlix APIs",()=>{
  for(const code of [search,detail]){
    assert.match(code,/sourcehub\/core/);
    assert.match(code,/Cache-Control/);
    assert.match(code,/no-store/);
    assert.doesNotMatch(code,/wpujoyflix|legacy|downstream|\/api\/searchstream|\/api\/detail/);
  }
});
test("new routes deny unapproved sources instead of falling back",()=>{
  for(const code of [search,detail]){
    assert.match(code,/sourcehub_no_approved_sources/);
    assert.match(code,/status:503/);
  }
  assert.match(search,/lines,\.\.\.item/);
});
