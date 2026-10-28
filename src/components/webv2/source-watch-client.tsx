"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SourceFilm, Episode } from "@/lib/sourcehub/core";
import { SourceVideoV2 } from "./source-video-v2";

type Phase="loading"|"ready"|"unavailable"|"missing"|"error";
export function SourceWatchClient({sourceId,workId}:{sourceId:string;workId:string}){
  const [film,setFilm]=useState<SourceFilm|null>(null);
  const [phase,setPhase]=useState<Phase>("loading");
  const [lineIndex,setLineIndex]=useState(0);
  const [episodeIndex,setEpisodeIndex]=useState(0);
  const [loadRequested,setLoadRequested]=useState(false);
  const [playbackError,setPlaybackError]=useState("");

  useEffect(()=>{
    if(!/^[a-z0-9_-]{2,40}$/i.test(sourceId)||!/^[a-zA-Z0-9_-]{1,96}$/.test(workId)){
      setPhase("missing");setFilm(null);return;
    }
    const controller=new AbortController();
    setPhase("loading");setFilm(null);setLineIndex(0);setEpisodeIndex(0);setLoadRequested(false);
    const params=new URLSearchParams({source:sourceId,id:workId});
    void fetch("/api/v2/sourcehub/detail?"+params.toString(),{
      signal:controller.signal,cache:"no-store"
    }).then(async response=>{
      if(response.status===503){setPhase("unavailable");return;}
      if(response.status===404){setPhase("missing");return;}
      if(!response.ok)throw Error("detail_request_failed");
      const data=await response.json() as {item?:SourceFilm};
      if(controller.signal.aborted)return;
      if(!data.item)throw Error("invalid_detail");
      setFilm(data.item);setPhase("ready");
    }).catch(()=>{
      if(!controller.signal.aborted)setPhase("error");
    });
    return ()=>controller.abort();
  },[sourceId,workId]);

  const lines=film?.lines||[];
  const line=lines[lineIndex];
  const episode:Episode|undefined=line?.episodes[episodeIndex];
  function selectLine(index:number){
    setLineIndex(index);setEpisodeIndex(0);setPlaybackError("");setLoadRequested(false);
  }
  function selectEpisode(index:number){
    setEpisodeIndex(index);setPlaybackError("");setLoadRequested(false);
  }
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8">
      <Link href="/v2" className="text-sm text-amber-200 hover:underline">返回 Web V2 搜索</Link>
      <header className="mt-6 border-b border-white/10 pb-5">
        <p className="text-xs tracking-widest text-slate-400">独立播放链路 · Web V2</p>
        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
          {film?.title||"影片播放页"}
        </h1>
        {film?<p className="mt-2 text-xs text-slate-400">{film.year||"未标注年份"} · 已批准来源 {film.sourceId}</p>:null}
      </header>
      {phase==="loading"?<p role="status" className="mt-8 text-slate-300">正在读取已批准来源和分集…</p>:null}
      {phase!=="ready"&&phase!=="loading"?(
        <p role="alert" className="mt-8 rounded-xl border border-white/20 bg-white/5 p-6 text-sm text-slate-200">
          {phase==="unavailable"?"当前没有审核通过的片源，不会回退旧网站接口。":
            phase==="missing"?"影片或来源不存在，或不在已批准作品范围内。":
            "详情请求失败，请稍后重试。"}
        </p>
      ):null}
      {phase==="ready"?(
        <section className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
          <div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
              {loadRequested&&episode?(
                <SourceVideoV2 key={line.id+":"+episode.index}
                  url={episode.mediaUrl} onFailure={setPlaybackError}/>
              ):(
                <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-slate-300">片源尚未加载。手动启动后浏览器才会请求视频。</p>
                  <button type="button" onClick={()=>setLoadRequested(true)}
                    disabled={!episode}
                    className="rounded-full bg-amber-200 px-6 py-2 font-semibold text-slate-900 disabled:opacity-40">
                    加载并播放
                  </button>
                </div>
              )}
            </div>
            {playbackError?<p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{playbackError}</p>:null}
            <p className="mt-4 text-xs leading-6 text-slate-400">播放由浏览器直接请求获许可的视频服务。页面不提供视频代理、任意解析脚本或规避付费访问的功能。</p>
            {film?.rights?(
              <section className="mt-5 space-y-2 rounded-xl border border-white/15 bg-[#1d2633] p-4 text-xs leading-6 text-slate-300">
                <h2 className="text-sm font-semibold">影片授权与署名</h2>
                <p>{film.rights.credit}</p>
                <p>{film.rights.deliveryNotice}</p>
                <div className="flex flex-wrap gap-4">
                  <a href={film.rights.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{film.rights.licenseName} 许可证</a>
                  <a href={film.rights.evidenceUrl} target="_blank" rel="noopener noreferrer" className="underline">版权官方说明</a>
                  <a href={film.rights.filePageUrl} target="_blank" rel="noopener noreferrer" className="underline">Commons 原始文件页面</a>
                </div>
              </section>
            ):null}
          </div>
          <aside className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-[#1d2633] p-4">
              <h2 className="mb-3 font-semibold">播放线路</h2>
              <div className="flex flex-wrap gap-2">
                {lines.map((s,i)=><button type="button" key={s.id} onClick={()=>selectLine(i)}
                  aria-pressed={i===lineIndex}
                  className={"rounded-lg border px-3 py-2 text-xs "+(i===lineIndex?
                    "border-amber-200 bg-amber-200/15 text-amber-100":"border-white/15 text-slate-300")}>
                  {s.name}
                </button>)}
              </div>
              {!lines.length?<p className="text-xs text-slate-400">该来源尚未提供可播放选集。</p>:null}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1d2633] p-4">
              <h2 className="mb-3 font-semibold">选集</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                {line?.episodes.map((e,i)=><button type="button" key={e.index} onClick={()=>selectEpisode(i)}
                  aria-pressed={i===episodeIndex}
                  className={"rounded-lg border px-2 py-2 text-xs "+(i===episodeIndex?
                    "border-amber-200 bg-amber-200/15":"border-white/15")}>
                  {e.label}
                </button>)}
              </div>
              {episode?<p className="mt-3 text-xs text-slate-400">格式：{episode.format.toUpperCase()}</p>:null}
            </div>
          </aside>
        </section>
      ):null}
    </main>
  );
}
