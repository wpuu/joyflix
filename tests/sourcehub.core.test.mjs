import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPROVED_SOURCES, canUseWork, cmsSearchRequest, isSourceApproved,
  normalizeCmsItem, normalizeCmsSearch, validateMediaUrl,
  cmsDetailRequest, searchSourceHub, detailSourceHub, readApprovedCmsJson,
  canonicalIdForWork, groupSourcehubFilms,
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

test("network adapter is never called when there is no approved source",async()=>{
  let calls=0;
  const transport=async()=>{calls++; throw Error("must not be used")};
  assert.deepEqual(await searchSourceHub("电影",today,[],transport),[]);
  assert.equal(await detailSourceHub("unknown","42",today,[],transport),null);
  assert.equal(calls,0);
});
test("search calls exact approved CMS only, normalized works only",async()=>{
  const seen=[];
  const transport=async(url,init)=>{
    seen.push({url,init});
    return Response.json({list:[
      {vod_id:"42",vod_name:"许可影片",vod_play_url:"正片$https://video.example.org/film.m3u8"},
      {vod_id:"777",vod_name:"没有许可"}
    ]});
  };
  const items=await searchSourceHub(" 影片 ",today,[fixture(),fixture({status:"pending"})],transport);
  assert.deepEqual(items.map(x=>x.workId),["42"]);
  assert.equal(seen.length,1);
  assert.equal(new URL(seen[0].url).hostname,"api.example.org");
  assert.equal(seen[0].init.redirect,"manual");
  assert.equal(seen[0].init.method,"GET");
});
test("detail request is approved by exact work and source; no blind fetching",async()=>{
  const src=fixture();
  const request=cmsDetailRequest(src,"42",today);
  assert.equal(new URL(request).searchParams.get("ids"),"42");
  assert.equal(cmsDetailRequest(src,"777",today),null);
  let requests=0;
  const transport=async()=>{requests++;return Response.json({list:[{vod_id:"42",vod_name:"许可影片"}]})};
  const item=await detailSourceHub(src.id,"42",today,[src],transport);
  assert.equal(item.title,"许可影片");
  assert.equal(await detailSourceHub(src.id,"777",today,[src],transport),null);
  assert.equal(requests,1);
});
test("CMS adapter rejects redirects, HTML, malformed JSON and oversized body",async()=>{
  const url="https://api.example.org/cms?ac=videolist&wd=movie";
  assert.equal(await readApprovedCmsJson(url,async()=>new Response(null,{status:302,headers:{location:"https://evil.example.org"}})),null);
  assert.equal(await readApprovedCmsJson(url,async()=>new Response("<html>error</html>",{headers:{"content-type":"text/html"}})),null);
  assert.equal(await readApprovedCmsJson(url,async()=>new Response("not-json",{headers:{"content-type":"application/json"}})),null);
  assert.equal(await readApprovedCmsJson(url,async()=>new Response("{}",{headers:{"content-type":"application/json","content-length":"900000"}})),null);
});

test("same title and year from different sources stay apart without reviewed identity mapping",()=>{
  const one=fixture();
  const other=fixture({id:"othersource",endpoint:"https://api.other.example.org/cms",allowedApiHost:"api.other.example.org"});
  const rows=[
    normalizeCmsItem({vod_id:"42",vod_name:"某某电影",vod_year:"2021"},one,today),
    normalizeCmsItem({vod_id:"42",vod_name:"某某电影",vod_year:"2021"},other,today)
  ];
  const groups=groupSourcehubFilms(rows);
  assert.equal(groups.length,2);
  assert.equal(groups[0].sourceCount,1);
});
test("explicitly reviewed canonical ID merges multiple legal sources, but not another year's remake",()=>{
  const common="wd:Q536299";
  const first=fixture({approval:{...fixture().approval,canonicalWorkIds:{"42":common}}});
  const second=fixture({
    id:"othersource",endpoint:"https://api.other.example.org/cms",allowedApiHost:"api.other.example.org",
    approval:{...fixture().approval,canonicalWorkIds:{"43":common}}
  });
  assert.equal(canonicalIdForWork(first,"42"),common);
  const a=normalizeCmsItem({vod_id:"42",vod_name:"作品",vod_year:"2001",vod_play_url:"正片$https://video.example.org/one.mp4"},first,today);
  const b=normalizeCmsItem({vod_id:"43",vod_name:"作品",vod_year:"2001",vod_play_url:"正片$https://video.example.org/two.mp4"},second,today);
  const remake=normalizeCmsItem({vod_id:"43",vod_name:"作品",vod_year:"2019"},second,today);
  const groups=groupSourcehubFilms([a,b,remake]);
  assert.equal(groups.length,2);
  assert.equal(groups[0].id,common);
  assert.equal(groups[0].sourceCount,2);
  assert.equal(groups[0].lineCount,2);
  assert.equal(groups[1].sourceCount,1);
});
test("unreviewed canonical identity mapping invalidates source instead of silently merging",()=>{
  const x=fixture({approval:{...fixture().approval,canonicalWorkIds:{"42":"https://evil.example.org/!"}}});
  assert.equal(isSourceApproved(x,today),false);
  const y=fixture({approval:{...fixture().approval,canonicalWorkIds:{"777":"wd:Q536299"}}});
  assert.equal(isSourceApproved(y,today),false);
});
