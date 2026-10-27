import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {groupSourcehubFilms} from "../src/lib/sourcehub/core.ts";
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
  assert.match(search,/groupSourcehubFilms\(rows\)/);
});

test("grouped SourceHub search cannot serialize media URLs or tokens to results",()=>{
  const groups=groupSourcehubFilms([{
    key:"source:licensed:42",sourceId:"licensed",workId:"42",
    canonicalId:"wd:Q536299",title:"许可电影",year:2001,
    lines:[{id:"licensed:0",name:"正片",episodes:[{
      index:1,label:"正片",format:"hls",
      mediaUrl:"https://video.example.org/film.m3u8?token=PRIVATE_TOKEN"
    }]}]
  }]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].sourceCount,1);
  assert.equal(groups[0].lineCount,1);
  const json=JSON.stringify(groups);
  assert.doesNotMatch(json,/PRIVATE_TOKEN|video\.example\.org|mediaUrl/);
});
