import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPROVED_SOURCES, canUseWork, cmsSearchRequest, isSourceApproved,
  normalizeCmsItem, normalizeCmsSearch, validateMediaUrl,
} from "../src/lib/sourcehub/core.ts";

function fixture(overrides={}) {
  return {
    id:"samplecms", name:"已获许可测试源", kind:"cms-json",
    endpoint:"https://api.example.org/cms",
    allowedApiHost:"api.example.org",
    allowedMediaHosts:["video.example.org"],
    status:"approved",
    approval:{
      rightsHolder:"Example Film Rights Owner",
      rightsEvidenceUrl:"https://rights.example.org/contracts/allowed-film",
      permittedUse:"playback",
      expiresOn:"2027-12-31",
      approvedWorkIds:["42","43"]
    },...overrides
  };
}
const today="2026-10-27";
test("no old source enters approval registry by default",()=>{
  assert.deepEqual(APPROVED_SOURCES,[]);
});
test("rights, approval state and expiry must match",()=>{
  assert.equal(isSourceApproved(fixture(),today),true);
  assert.equal(isSourceApproved(fixture({status:"pending"}),today),false);
  assert.equal(isSourceApproved(fixture({status:"suspended"}),today),false);
  assert.equal(isSourceApproved(fixture({endpoint:"http://api.example.org/cms"}),today),false);
  assert.equal(isSourceApproved(fixture({endpoint:"https://evil.example.org/cms"}),today),false);
  assert.equal(isSourceApproved(fixture({allowedApiHost:"localhost"}),today),false);
  assert.equal(isSourceApproved(fixture({approval:{...fixture().approval,expiresOn:"2020-01-01"}}),today),false);
  assert.equal(isSourceApproved(fixture({approval:{...fixture().approval,approvedWorkIds:[]}}),today),false);
  assert.equal(isSourceApproved(fixture({approval:{...fixture().approval,rightsEvidenceUrl:"http://rights.example.org"}}),today),false);
  assert.equal(isSourceApproved(fixture({approval:{...fixture().approval,expiresOn:"2026-02-30"}}),today),false);
});
test("permission is per-work, never whole-site automatically",()=>{
  assert.equal(canUseWork(fixture(),"42",today),true);
  assert.equal(canUseWork(fixture(),"13",today),false);
  assert.equal(normalizeCmsItem({vod_id:"13",vod_name:"Unlicensed"},fixture(),today),null);
});
test("normalizes CMS episode formats but ignores unsafe and disallowed URLs",()=>{
  const row={
    vod_id:42, vod_name:" <b>示例影片</b> ", vod_year:"2022",
    vod_play_from:"线路甲$$$线路乙",
    vod_play_url:[
      "第一集$https://video.example.org/s1.m3u8?token=abc#重复$https://video.example.org/s1.m3u8?token=abc",
      "广告$https://evil.example.org/ad.m3u8#HTML$javascript:alert(1)#其他$https://video.example.org/s2.mp4"
    ].join("$$$")
  };
  const item=normalizeCmsItem(row,fixture(),today);
  assert.equal(item.key,"source:samplecms:42");
  assert.equal(item.title,"示例影片");
  assert.equal(item.year,2022);
  assert.equal(item.lines.length,2);
  assert.equal(item.lines[0].episodes.length,1);
  assert.equal(item.lines[0].episodes[0].format,"hls");
  assert.equal(item.lines[1].episodes.length,1);
  assert.equal(item.lines[1].episodes[0].format,"mp4");
  assert.equal(item.lines[1].episodes[0].label,"其他");
});
test("rejects internal, disallowed host, non HTTPS or nonmedia addresses",()=>{
  const source=fixture();
  for(const value of [
    "http://video.example.org/a.m3u8","https://evil.example.org/a.m3u8",
    "https://127.0.0.1/a.mp4","https://metadata.google.internal/a.mp4",
    "https://video.example.org/a.html","file:///etc/passwd",
    "https://video.example.org:8443/a.mp4",
    "https://u:p@video.example.org/a.m3u8"
  ]) assert.equal(validateMediaUrl(value,source),null,value);
  assert.equal(validateMediaUrl("https://video.example.org/a.webm",source).format,"webm");
});
test("bounded decoding denies unknown works and removes duplicates",()=>{
  const source=fixture();
  const content=[
    {vod_id:"42",vod_name:"Film 1"},{vod_id:"42",vod_name:"Duplicate"},
    {vod_id:"43",vod_name:"Film 2"},{vod_id:"999",vod_name:"Unlicensed"}
  ];
  assert.deepEqual(normalizeCmsSearch({list:content},source,today).map(x=>x.workId),["42","43"]);
  assert.deepEqual(normalizeCmsSearch({list:content},fixture({status:"pending"}),today),[]);
  assert.deepEqual(normalizeCmsSearch({list:Array(1001).fill(content[0])},source,today),[]);
  assert.deepEqual(normalizeCmsSearch({results:content},source,today),[]);
});
test("search plans are bounded and never run network requests",()=>{
  const plan=cmsSearchRequest(fixture(),"  少林足球  ",today);
  const url=new URL(plan);
  assert.equal(url.origin,"https://api.example.org");
  assert.equal(url.searchParams.get("wd"),"少林足球");
  assert.equal(url.searchParams.get("ac"),"videolist");
  assert.equal(cmsSearchRequest(fixture(),"中".repeat(81),today),null);
  assert.equal(cmsSearchRequest(fixture({status:"pending"}),"a",today),null);
});
