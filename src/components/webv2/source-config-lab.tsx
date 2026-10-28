"use client";

import {useEffect,useRef,useState,type FormEvent} from "react";
import {
  inspectTvboxConfig,inspectCmsEndpoint,probeCms,tvboxAuditReport,
  type ConfigAudit,type CmsFilm,type TvboxSite
} from "@/lib/webv2/source-config-lab";
import {probeRemoteConfig} from "@/lib/webv2/source-config-remote";


const remoteErrors:Record<string,string>={
  INVALID_URL:"请输入标准 HTTPS 单仓配置链接，不支持凭证、端口或片段",
  PRIVATE_ADDRESS:"不允许IP地址、回环或内网地址",
  QUERY_NOT_ALLOWED:"订阅链接包含 ? 查询参数，可能泄露访问令牌，已拒绝",
  CORS_OR_NETWORK:"源站不允许浏览器跨域读取，或网络连接失败",
  CANCELLED:"请求已取消",TIMEOUT:"远程配置10秒内未返回",
  HTTP_ERROR:"源站HTTP状态失败",TOO_LARGE:"配置文件超过128KB安全上限",
  INVALID_CONTENT_TYPE:"返回内容不是受支持的JSON或纯文本",
  INVALID_BODY:"远程响应没有可读文件",
  NOT_JSON:"不是支持的JSON/JSONC配置",
  INVALID_STRUCTURE:"没有有效的sites站点列表",
  MULTI_REPO_NOT_SUPPORTED:"这是多仓 urls 列表：请先选择其中的单仓，暂不递归访问"
};

const reason:Record<string,string>={
  XML_HTTP_NOT_SUPPORTED:"XML接口：当前浏览器实验室仅支持JSON",
  SPIDER_EXECUTION_NOT_SUPPORTED:"Spider/JAR/Python/JS插件：不会执行",
  EXTENDED_HTTP_NOT_SUPPORTED:"扩展HTTP接口：需要独立适配",
  UNKNOWN_TYPE:"未知站点类型",DUPLICATE_KEY:"来源标识重复",
  INVALID_KEY:"来源标识缺失",SEARCH_DISABLED:"搜索已关闭",
  EXECUTABLE_EXTENSION:"包含脚本执行或点击代码",
  EXTERNAL_PARSER_OR_HEADERS:"依赖解析器、扩展参数或特殊请求头",
  ENDPOINT_UNSUPPORTED:"接口不是可直接测试的标准HTTPS地址"
};
const errors:Record<string,string>={
  INVALID_QUERY:"请输入1–80字的关键词，或有效影片ID",
  INVALID_ENDPOINT:"请输入可用的 HTTPS CMS JSON 接口地址",
  TIMEOUT:"9秒内没有取得有效响应",
  CANCELLED:"已取消",CORS_OR_NETWORK:"浏览器无法跨站读取，可能是CORS、网络或源站策略限制",
  HTTP_ERROR:"源接口返回非成功HTTP状态",
  TOO_LARGE:"接口数据超过450 KB安全上限",
  INVALID_JSON:"返回的不是有效JSON（可能返回了HTML页面）",
  UNSUPPORTED_SCHEMA:"不是受支持的苹果CMS JSON Provide列表结构"
};

export function SourceConfigLab({onSelectMedia}:{
  onSelectMedia:(mediaUrl:string)=>void;
}){
  const [rawConfig,setRawConfig]=useState("");
  const [remoteUrl,setRemoteUrl]=useState("");
  const [remoteLoading,setRemoteLoading]=useState(false);
  const [onlyEligible,setOnlyEligible]=useState(false);
  const [audit,setAudit]=useState<ConfigAudit|null>(null);
  const [endpoint,setEndpoint]=useState("");
  const [showEndpoint,setShowEndpoint]=useState(false);
  const [selectedName,setSelectedName]=useState("");
  const [keyword,setKeyword]=useState("");
  const [films,setFilms]=useState<CmsFilm[]>([]);
  const [phase,setPhase]=useState<"idle"|"searching"|"detail"|"ready">("idle");
  const [diagnostic,setDiagnostic]=useState("");
  const [copied,setCopied]=useState("");
  const pending=useRef<AbortController|null>(null);
  const remotePending=useRef<AbortController|null>(null);

  useEffect(()=>()=>{pending.current?.abort();remotePending.current?.abort();},[]);

  async function importRemote(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    remotePending.current?.abort();
    const controller=new AbortController();
    remotePending.current=controller;
    setRemoteLoading(true);
    setCopied("");
    setDiagnostic("浏览器正在读取一份远程配置，不会访问其中列出的影视站点。");
    const result=await probeRemoteConfig(remoteUrl,fetch,controller.signal);
    if(controller.signal.aborted)return;
    remotePending.current=null;
    setRemoteLoading(false);
    setRemoteUrl("");
    setFilms([]);
    setEndpoint("");
    setSelectedName("");
    setPhase("idle");
    if(!result.ok){
      setAudit(null);
      setDiagnostic(remoteErrors[result.code]||"远程配置读取失败");
      return;
    }
    setAudit(result.audit);
    setRawConfig("");
    setOnlyEligible(true);
    setDiagnostic("已读取并分析 "+result.audit.total+
      " 个站点。可手动测试的JSON HTTP只是格式候选，并非真实播放或版权证明。");
  }

  function analyze(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    pending.current?.abort();
    const next=inspectTvboxConfig(rawConfig);
    setAudit(next);
    setOnlyEligible(false);
    setRawConfig("");
    setCopied("");
    setFilms([]);
    setDiagnostic(next.ok
      ?"只进行本地JSON结构识别；不会执行Spider、读取网络或导入公共片库。"
      :next.code==="NOT_JSON"?"不是有效JSON，请粘贴TVBox配置中的sites数组。":
       next.code==="TOO_LARGE"?"配置内容超过128KB限制。":
       next.code==="MULTI_REPO_NOT_SUPPORTED"?"多仓 urls 订阅请先选择单仓，本页不会递归抓取。":
       "未找到有效的sites站点列表。");
  }
  function choose(site:TvboxSite){
    if(!site.probeEligible || !site.endpoint)return;
    pending.current?.abort();
    setEndpoint(site.endpoint);
    setSelectedName(site.name);
    setFilms([]);
    setDiagnostic("已选择JSON HTTP来源；请填写关键词并手动发起浏览器查询。");
    setPhase("idle");
  }
  async function doSearch(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    pending.current?.abort();
    const checked=inspectCmsEndpoint(endpoint.trim());
    if(!checked.ok){
      setDiagnostic("无效接口地址：只接受公开的HTTPS端点，不能携带账号密码、端口或锚点。");
      setFilms([]);
      return;
    }
    if(!keyword.trim() || keyword.trim().length>80){
      setDiagnostic("关键词需要1–80字。");
      setFilms([]);
      return;
    }
    const controller=new AbortController();
    pending.current=controller;
    setFilms([]);
    setPhase("searching");
    setDiagnostic("浏览器正在直连CMS；此请求不会经过本站后端。");
    setCopied("");
    const result=await probeCms(checked.endpoint,"search",keyword,fetch,controller.signal);
    if(controller.signal.aborted)return;
    pending.current=null;
    setPhase("ready");
    if(!result.ok){
      setDiagnostic(errors[result.code]||"无法识别的接口错误");
      return;
    }
    setFilms(result.films);
    setDiagnostic(result.code==="EMPTY"
      ?"CMS请求成功，但没有返回有效影片。":"CMS请求成功，以下仅显示本次浏览器读取的结果，不代表可公开使用。");
  }
  async function loadDetails(film:CmsFilm){
    pending.current?.abort();
    const controller=new AbortController();
    pending.current=controller;
    setPhase("detail");
    setDiagnostic("正在读取指定影片的详情和可识别播放地址。");
    const result=await probeCms(endpoint,"detail",film.id,fetch,controller.signal);
    if(controller.signal.aborted)return;
    pending.current=null;
    setPhase("ready");
    if(!result.ok){
      setDiagnostic(errors[result.code]||"详情读取失败");
      return;
    }
    const updated=result.films.find(x=>x.id===film.id);
    if(!updated){
      setDiagnostic("详情接口未返回指定作品，未替换原列表。");
      return;
    }
    setFilms(rows=>rows.map(x=>x.id===film.id?updated:x));
    setDiagnostic(updated.episodeCount
      ?"已发现可供浏览器直接尝试的视频地址，需用户主动点击才会加载。"
      :"详情已读取，但没有直接支持的HLS/MP4/WebM媒体；可能需要第三方解析器。");
  }
  function reset(){
    remotePending.current?.abort();
    remotePending.current=null;
    setRemoteLoading(false);
    setRemoteUrl("");
    setOnlyEligible(false);
    pending.current?.abort();
    pending.current=null;
    setRawConfig("");
    setAudit(null);
    setEndpoint("");
    setKeyword("");
    setSelectedName("");
    setFilms([]);
    setPhase("idle");
    setDiagnostic("本次配置和查询已清空，不会写入站点或浏览器存储。");
    setCopied("");
  }
  async function copy(){
    const summary=audit?tvboxAuditReport(audit):"TVBOX_CONFIG_AUDIT_V1\nstatus=NOT_ANALYZED";
    const report=summary+"\nCMS_PROBE_STATUS="+
      (phase==="ready"?(films.length?"RESULTS_PRESENT":"NO_RESULTS"):"NOT_CONFIRMED")+
      "\nCMS_FILM_COUNT="+films.length+"\nCMS_PLAYBACK_FIRST_FRAME=UNVERIFIED";
    try{
      if(!navigator.clipboard?.writeText)throw Error("clipboard");
      await navigator.clipboard.writeText(report);
      setCopied("已复制来源兼容性摘要，不含影视源URL、密钥或影片播放地址。");
    }catch{setCopied("复制受限，可手动记录分类数量。");}
  }

  return(
    <section className="mt-8 space-y-5 rounded-xl border border-amber-300/20 bg-[#161e2a] p-5 text-sm">
      <header>
        <h2 className="text-xl font-semibold">TVBox / 喵影视 / CMS 兼容性实验室</h2>
        <p className="mt-2 text-xs leading-6 text-slate-300">
          第一阶段识别配置类型；第二阶段在浏览器直接搜索CMS JSON接口并选择影片测试。
          配置仅在当前页面内存里处理，不上传、保存或执行其中的脚本。
          仅测试您有合法访问权限的来源。
        </p>
      </header>
      <form onSubmit={e=>{void importRemote(e);}} className="space-y-3 border-b border-white/10 pb-5">
        <label htmlFor="tvbox-remote-url" className="block font-medium">1. 远程单仓 TVBox 订阅地址</label>
        <input id="tvbox-remote-url" value={remoteUrl} type="password"
          onChange={e=>setRemoteUrl(e.target.value)}
          placeholder="https://raw.githubusercontent.com/.../config.json"
          autoComplete="off" spellCheck={false}
          className="h-11 w-full rounded-lg border border-white/20 bg-[#101720] px-3 text-xs outline-none"/>
        <button type="submit" disabled={!remoteUrl.trim()||remoteLoading}
          className="rounded-lg bg-amber-200 px-5 py-2.5 font-semibold text-slate-900 disabled:opacity-40">
          {remoteLoading?"正在读取配置…":"手动读取远程 TVBox 配置"}
        </button>
        <p className="text-xs leading-6 text-slate-400">
          只读单份HTTPS JSON/JSONC配置，最多128KB，不能带查询令牌；浏览器直连，需源站允许CORS。
          不访问多仓中的其他网址、不执行Spider插件，也不存储订阅信息。
        </p>
      </form>
      <form onSubmit={analyze} className="space-y-3 border-b border-white/10 pb-5">
        <label htmlFor="tvbox-raw" className="block font-medium">或：直接粘贴 TVBox/FongMi JSON/JSONC 配置</label>
        <textarea id="tvbox-raw" value={rawConfig} rows={5} maxLength={128000}
          onChange={e=>setRawConfig(e.target.value)} autoComplete="off" spellCheck={false}
          placeholder='{"sites":[{"key":"licensed","name":"许可 CMS","type":1,"api":"https://example.org/api.php/provide/vod/"}]}'
          className="w-full resize-y rounded-lg border border-white/20 bg-[#101720] p-3 font-mono text-xs text-slate-200 outline-none"/>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!rawConfig.trim()}
            className="rounded-lg bg-amber-200 px-5 py-2.5 font-semibold text-slate-900 disabled:opacity-40">
            本地识别配置
          </button>
          <button type="button" onClick={reset} className="rounded-lg border border-white/20 px-4 py-2.5">
            清除本次资料
          </button>
        </div>
        {audit?(
          <div className="space-y-2">
            <p className="font-medium">{audit.ok
              ?"共 "+audit.total+" 个来源，已扫描 "+audit.sites.length+" 个":"配置识别失败："+audit.code}</p>
            {audit.ok && audit.sites.some(s=>s.probeEligible)?(
              <label className="flex items-center gap-2 border border-white/10 rounded-lg p-2 text-xs">
                <input type="checkbox" checked={onlyEligible}
                  onChange={e=>setOnlyEligible(e.target.checked)}/>
                只看可手动测试的 JSON HTTP（{audit.sites.filter(s=>s.probeEligible).length}个）
              </label>
            ):null}
            {audit.ok?audit.sites.filter(s=>!onlyEligible||s.probeEligible).map((site,index)=>(
              <div key={site.key+":"+index}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{site.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {site.kind==="cms-json"?"JSON HTTP（type=1）":
                     site.kind==="cms-xml"?"XML HTTP（type=0）":
                     site.kind==="spider"?"Spider 脚本（type=3）":
                     site.kind==="extended-http"?"扩展HTTP（type=4）":"未知类型"}
                  </p>
                  {site.notes.length?(
                    <p className="mt-1 text-xs text-amber-200">{site.notes.map(n=>reason[n]||n).join("；")}</p>
                  ):<p className="mt-1 text-xs text-slate-300">可尝试标准CMS JSON浏览器直连</p>}
                </div>
                <button type="button" disabled={!site.probeEligible}
                  onClick={()=>choose(site)}
                  className="rounded-lg border border-amber-200/40 px-3 py-2 text-xs disabled:opacity-40">
                  选择此来源
                </button>
              </div>
            )):null}
          </div>
        ):null}
      </form>

      <form onSubmit={e=>{void doSearch(e);}} className="space-y-3">
        <label htmlFor="cms-endpoint" className="block font-medium">2. CMS JSON 接口（亦可手工输入）</label>
        {selectedName?<p className="text-xs text-slate-300">已选择：{selectedName}</p>:null}
        <div className="flex flex-wrap gap-2">
          <input id="cms-endpoint" value={endpoint} type={showEndpoint?"url":"password"}
            onChange={e=>{setEndpoint(e.target.value);setSelectedName("");}}
            placeholder="https://.../api.php/provide/vod/"
            autoComplete="off" spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-[#101720] px-3 text-xs outline-none"/>
          <button type="button" onClick={()=>setShowEndpoint(v=>!v)}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs">
            {showEndpoint?"隐藏地址":"显示地址"}
          </button>
        </div>
        <input value={keyword} maxLength={80} onChange={e=>setKeyword(e.target.value)}
          placeholder="测试搜索词"
          className="h-11 w-full rounded-lg border border-white/20 bg-[#101720] px-3 outline-none"/>
        <button type="submit" disabled={!endpoint.trim()||!keyword.trim()||phase==="searching"||phase==="detail"}
          className="rounded-lg bg-amber-200 px-5 py-2.5 font-semibold text-slate-900 disabled:opacity-40">
          {phase==="searching"?"搜索中…":"浏览器直连查询（需要源站允许CORS）"}
        </button>
        <p className="text-xs leading-6 text-slate-400">
          点击后浏览器将向您输入的源站直接发送搜索词或影片ID，源站可能记录IP；
          不携带本站Cookies，不跨域代理，不伪造Referer，不执行脚本。
          CMS虽可读取，也不自动证明播放权限或可商用。
        </p>
      </form>
      {diagnostic?<p role="status" className="rounded-lg border border-white/10 p-3 text-xs text-amber-100">{diagnostic}</p>:null}
      {films.length?(
        <div aria-label="本次CMS搜索结果" className="space-y-3 border-t border-white/10 pt-4">
          <h3 className="font-semibold">本次查询结果（{films.length}部）</h3>
          {films.map(film=>(
            <article key={film.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="font-medium">{film.title}</p>
              <p className="mt-1 text-xs text-slate-400">
                年份：{film.year||"未提供"} · 可识别的直链选集：{film.episodeCount}
              </p>
              {!film.episodeCount?(
                <button type="button" onClick={()=>{void loadDetails(film);}}
                  disabled={phase==="detail"||phase==="searching"}
                  className="mt-2 rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40">
                  读取此作品详情
                </button>
              ):(
                <div className="mt-3 flex flex-wrap gap-2">
                  {film.episodes.slice(0,12).map((episode,i)=>(
                    <button key={i} type="button" onClick={()=>onSelectMedia(episode.mediaUrl)}
                      className="rounded-lg border border-amber-200/30 px-3 py-2 text-xs">
                      测试 {episode.label} · {episode.format.toUpperCase()}
                    </button>
                  ))}
                  {film.episodeCount>12?<span className="text-xs text-slate-400">仅显示前12集供手动测试</span>:null}
                </div>
              )}
            </article>
          ))}
        </div>
      ):null}
      <button type="button" onClick={()=>{void copy();}}
        className="rounded-lg border border-white/20 px-4 py-2.5">复制脱敏兼容性摘要</button>
      {copied?<p role="status" className="text-xs text-slate-300">{copied}</p>:null}
    </section>
  );
}
