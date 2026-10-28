"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { SourceGroup } from "@/lib/sourcehub/core";

type SearchEntry = SourceGroup;
type QueryState = "idle" | "loading" | "found" | "empty" | "unavailable" | "error";

export default function WebV2Home() {
  const [keyword,setKeyword]=useState("");
  const [state,setState]=useState<QueryState>("idle");
  const [items,setItems]=useState<SearchEntry[]>([]);
  const [notice,setNotice]=useState("");
  const pending=useRef<AbortController|null>(null);

  useEffect(()=>()=>pending.current?.abort(),[]);

  async function search(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value=keyword.trim();
    if(!value || value.length>80) {
      setNotice("请输入1–80字的影片名称。");
      return;
    }
    pending.current?.abort();
    const controller=new AbortController();
    pending.current=controller;
    setItems([]);
    setState("loading");
    setNotice("");
    try {
      const response=await fetch("/api/v2/sourcehub/search?keyword="+encodeURIComponent(value),{
        signal:controller.signal,cache:"no-store"
      });
      if(controller.signal.aborted)return;
      if(response.status===503) {
        setState("unavailable");
        setNotice("暂无审核通过的片源。已停止调用旧 JoyFlix 接口，不展示虚假搜索结果。");
        return;
      }
      if(!response.ok)throw Error("search_failed");
      const payload=await response.json() as {items?:SearchEntry[]};
      if(controller.signal.aborted)return;
      const rows=Array.isArray(payload.items)?payload.items:[];
      setItems(rows);
      setState(rows.length?"found":"empty");
      if(!rows.length)setNotice("未找到当前可用的已批准片源记录。");
    } catch(error) {
      if(controller.signal.aborted)return;
      setState("error");
      setNotice("请求失败，请检查预览服务或稍后重试。");
    } finally {
      if(pending.current===controller)pending.current=null;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 md:pt-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/20 text-xl text-amber-200">影</div>
          <div>
            <p className="text-xl font-semibold tracking-wide">观影指南 Web V2</p>
            <p className="text-xs text-slate-400">从 TV 新版迁移 · 片源中心</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/v2/qa/source-lab" className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-200 hover:border-amber-300/60">
            个人片源实验室
          </Link>
          <span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs text-amber-200">隔离预览 · 未公开运营</span>
        </div>
      </header>

      <section className="max-w-3xl pb-12 pt-12 md:pt-20">
        <p className="text-xs font-medium tracking-[0.2em] text-amber-300">WEB V2 SOURCEHUB</p>
        <h1 className="mt-4 text-3xl font-semibold leading-snug md:text-5xl">
          搜索影片，选择来源，直接观看。
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
          新版保留原 TV 的移动端体验，将搜索、详情、线路和播放器接入独立 SourceHub。
          当前只允许经过内容使用审核的来源；不会回退旧站或使用未知采集接口。
        </p>
        <form onSubmit={search} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">影视搜索词</span>
            <input name="keyword" value={keyword} maxLength={80}
              onChange={e=>setKeyword(e.target.value)}
              placeholder="输入影片或电视剧名称"
              className="h-12 w-full rounded-xl border border-white/20 bg-[#202835] px-4 text-base text-white outline-none placeholder:text-slate-400 focus:border-amber-400" />
          </label>
          <button type="submit" disabled={state==="loading"}
            className="h-12 rounded-xl bg-amber-200 px-7 font-semibold text-slate-900 disabled:opacity-50">
            {state==="loading"?"正在搜索…":"搜索影片"}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">搜索词仅用于本次请求，不要填写账号密码或个人资料。</p>
      </section>

      <section aria-label="SourceHub 查询结果" className="border-t border-white/10 pt-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">已核准来源</h2>
          <span className="text-xs text-slate-400">{items.length} 部作品</span>
        </div>
        {state==="idle"?(
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
            片源中心已具备独立接口。输入片名后将查询当前批准的来源，不以模拟片目冒充真实片库。
          </p>
        ):null}
        {notice?<p role="status" className="rounded-xl border border-amber-300/20 bg-amber-200/5 p-5 text-sm text-amber-100">{notice}</p>:null}
        {state==="loading"?<p role="status" className="text-sm text-slate-300">查询中…</p>:null}
        {items.length?(
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map(item=>(
              <Link key={item.id+"|"+item.year}
                href={"/v2/watch?source="+encodeURIComponent(item.sourceId)+"&id="+encodeURIComponent(item.workId)}
                className="group rounded-xl border border-white/10 bg-[#1d2633] p-3 transition hover:border-amber-300/50">
                <div className="flex aspect-[2/3] items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 px-3 text-center text-xl font-semibold text-white/85">
                  {item.title}
                </div>
                <p className="mt-3 line-clamp-1 text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-slate-400">{item.year||"年份未核实"} · {item.sourceCount} 个来源 · {item.lineCount} 条线路</p>
              </Link>
            ))}
          </div>
        ):null}
      </section>
      <footer className="mt-16 border-t border-white/10 pt-5 text-xs text-slate-500">
        V2 工作分支验证界面。弹幕、Agnes 审核与 Android 共用接口将在片源端到端验收后接入。
      </footer>
    </main>
  );
}
