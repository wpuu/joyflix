"use client";

import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import Hls from "hls.js";
import {hlsFailureLabel,mediaErrorLabel,preferNativeHls} from "@/lib/webv2/player/hls-playback-policy";
import {observedForwardPlayback} from "@/lib/webv2/player/playback-health";
import {
  inspectSourceLabUrl,safeSourceLabErrorCode,sourceLabReport,type MediaKind,
} from "@/lib/webv2/source-lab";

type Selected={kind:MediaKind;url:string;id:number};

export function SourceLabClient(){
  const [urlText,setUrlText]=useState("");
  const [showUrl,setShowUrl]=useState(false);
  const [selected,setSelected]=useState<Selected|null>(null);
  const [message,setMessage]=useState("尚未测试。");
  const [method,setMethod]=useState("未开始");
  const [confirmed,setConfirmed]=useState(false);
  const [seekConfirmed,setSeekConfirmed]=useState(false);
  const [duration,setDuration]=useState<number|null>(null);
  const [failure,setFailure]=useState("");
  const [copied,setCopied]=useState("");
  const videoRef=useRef<HTMLVideoElement>(null);
  const goal=useRef<number|null>(null);
  const counter=useRef(0);

  function begin(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const checked=inspectSourceLabUrl(urlText);
    if(!checked.ok){
      setMessage(checked.code==="UNSUPPORTED_FORMAT"?
        "只接受 HTTPS 的 .m3u8、.mp4、.m4v、.webm 视频链接。":
        checked.code==="PRIVATE_ADDRESS"?
        "不允许测试局域网、回环或内网地址。":"无效的 HTTPS 视频链接。");
      return;
    }
    counter.current+=1;
    setSelected({url:checked.url,kind:checked.kind,id:counter.current});
    setUrlText("");
    setConfirmed(false);
    setSeekConfirmed(false);
    setDuration(null);
    setFailure("");
    setCopied("");
    goal.current=null;
    setMethod("待检测");
    setMessage("已选择视频；浏览器开始连接来源。请手动点击视频播放键。");
  }
  function reset(){
    setSelected(null);
    setUrlText("");
    setConfirmed(false);
    setSeekConfirmed(false);
    setDuration(null);
    setFailure("");
    setCopied("");
    setMethod("未开始");
    setMessage("已清除本次测试，网址未保存到站点。");
  }

  useEffect(()=>{
    if(!selected)return;
    const video=videoRef.current;
    if(!video)return;
    let active=true;
    let hls:Hls|null=null;
    let previous:number|null=null,seconds=0;
    const fail=(code:string)=>{
      if(!active)return;
      const safe=safeSourceLabErrorCode(code);
      setFailure(safe);
      setMessage("加载或解码发生错误；错误代码可复制，但不会附带访问地址。");
    };
    const onVideoError=()=>fail(mediaErrorLabel(video.error?.code));
    const onSeek=()=>{previous=null;};
    const onLoaded=()=>{
      if(active && Number.isFinite(video.duration))setDuration(video.duration);
    };
    const onUpdate=()=>{
      if(!active)return;
      const delta=observedForwardPlayback(previous,video.currentTime,video.paused,video.seeking);
      seconds+=delta;
      previous=video.currentTime;
      if(seconds>=2 && video.readyState>=3 && video.videoWidth>0){
        setConfirmed(true);
        setMessage("观察到真实视频播放超过2秒。");
      }
      if(goal.current!==null && !video.paused && !video.seeking &&
         video.currentTime>=goal.current+1.2 && video.readyState>=3){
        setSeekConfirmed(true);
        goal.current=null;
      }
    };
    video.addEventListener("error",onVideoError);
    video.addEventListener("seeking",onSeek);
    video.addEventListener("seeked",onSeek);
    video.addEventListener("loadedmetadata",onLoaded);
    video.addEventListener("timeupdate",onUpdate);
    try{
      if(selected.kind==="hls"){
        const native=Boolean(video.canPlayType("application/vnd.apple.mpegurl") ||
          video.canPlayType("application/x-mpegURL"));
        if(preferNativeHls(native,typeof window.MediaSource!=="undefined",
          "ManagedMediaSource" in window)){
          video.src=selected.url;
          setMethod("原生 HLS");
        }else if(Hls.isSupported()){
          hls=new Hls({enableWorker:true});
          hls.on(Hls.Events.ERROR,(_event,data)=>{
            if(data.fatal)fail(hlsFailureLabel(data));
          });
          hls.loadSource(selected.url);
          hls.attachMedia(video);
          setMethod("hls.js");
        }else if(native){
          video.src=selected.url;
          setMethod("原生 HLS");
        }else{
          fail("HLS_UNSUPPORTED：浏览器不支持该 HLS 媒体。");
        }
      }else{
        video.src=selected.url;
        setMethod("浏览器 HTML5 视频");
      }
    }catch{fail("PLAYER_INITIALIZE_FAILED：初始化失败。");}
    return()=>{
      active=false;
      hls?.destroy();
      video.removeEventListener("error",onVideoError);
      video.removeEventListener("seeking",onSeek);
      video.removeEventListener("seeked",onSeek);
      video.removeEventListener("loadedmetadata",onLoaded);
      video.removeEventListener("timeupdate",onUpdate);
      video.pause();
      video.removeAttribute("src");
    };
  },[selected]);

  function seekTo60(){
    const video=videoRef.current;
    if(!video || !Number.isFinite(video.duration) || video.duration<=90)return;
    goal.current=60;
    setSeekConfirmed(false);
    try{
      video.currentTime=60;
      void video.play().catch(()=>setFailure("PLAYER_USER_GESTURE_REQUIRED"));
    }catch{setFailure("PLAYER_SEEK_FAILED");}
  }
  const report=sourceLabReport({
    started:!!selected,format:selected?.kind??null,
    playbackSecondsConfirmed:confirmed,seek60Confirmed:seekConfirmed,
    durationSeconds:duration,failureCode:failure
  });
  async function copy(){
    try{
      if(!navigator.clipboard?.writeText)throw Error("clipboard");
      await navigator.clipboard.writeText(report);
      setCopied("已复制脱敏结果，不含媒体URL、访问令牌、IP或播放记录。");
    }catch{setCopied("浏览器限制复制；可以手动复制下方文本。");}
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-8">
      <Link href="/v2" className="text-sm text-amber-200 hover:underline">返回 Web V2</Link>
      <header>
        <p className="text-xs tracking-wider text-amber-300">PRIVATE SOURCE LAB</p>
        <h1 className="mt-2 text-3xl font-semibold">个人片源实验室</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          用于检测您有权访问和使用的直链视频。仅浏览器直接请求视频，
          不把链接发送给本站后端、存储在数据库或加入公共片库；不提供视频代理、DRM或访问限制绕过。
        </p>
      </header>
      <form onSubmit={begin} className="space-y-3 rounded-xl border border-white/15 bg-[#1d2633] p-4">
        <label htmlFor="media-url" className="block text-sm font-medium">视频直链（HTTPS）</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="media-url" value={urlText} type={showUrl?"url":"password"}
            onChange={e=>setUrlText(e.target.value)} autoComplete="off" spellCheck={false}
            placeholder="粘贴 .m3u8 / .mp4 / .webm 视频地址"
            className="h-12 w-full min-w-0 flex-1 rounded-lg border border-white/20 bg-[#11151c] px-3 text-sm outline-none focus:border-amber-300" />
          <button type="button" onClick={()=>setShowUrl(v=>!v)}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm">
            {showUrl?"隐藏地址":"查看地址"}
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={!urlText.trim()}
            className="rounded-lg bg-amber-200 px-5 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40">手动开始测试</button>
          <button type="button" onClick={reset} className="rounded-lg border border-white/20 px-5 py-3 text-sm">停止并清除</button>
        </div>
        <p className="text-xs leading-6 text-slate-400">
          页面不会将片源URL写入地址栏、日志或浏览器本地存储。
          视频站可能自行记录访问者IP；HLS.js需要正常跨域响应才能读取清单和分片。
        </p>
      </form>
      <section className="overflow-hidden rounded-xl border border-white/15 bg-black">
        {selected?(
          <video key={selected.id} ref={videoRef} controls playsInline preload="none"
            aria-label="源实验室测试视频" className="aspect-video w-full"/>
        ):(
          <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-slate-300">
            尚未发起媒体请求。选择地址后才会创建视频播放器。
          </div>
        )}
      </section>
      <section className="space-y-3 rounded-xl border border-white/15 bg-[#1d2633] p-5 text-sm">
        <h2 className="text-lg font-semibold">真实播放检查</h2>
        <p role="status">{message}</p>
        <p>播放器：{method}</p>
        <p>播放前进至少2秒：{confirmed?"通过":"尚未确认"}</p>
        <p>跳转到60秒并继续播放：{seekConfirmed?"通过":"尚未确认"}</p>
        <p>检测时长：{duration===null?"尚未取得":Math.round(duration)+"秒"}</p>
        {failure?<p role="alert" className="text-amber-200">错误类别：{failure}</p>:null}
        <button type="button" onClick={seekTo60}
          disabled={!selected || duration===null || duration<=90}
          className="rounded-lg border border-white/25 px-4 py-3 text-sm disabled:opacity-40">
          跳至60秒并检查续播
        </button>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">脱敏诊断结果</h2>
        <textarea readOnly rows={8} value={report} aria-label="脱敏片源诊断报告"
          className="w-full rounded-xl border border-white/20 bg-[#11151c] p-4 font-mono text-xs leading-6 text-slate-200"/>
        <button type="button" onClick={()=>void copy()}
          className="rounded-lg border border-white/25 px-4 py-3 text-sm">复制诊断结果</button>
        {copied?<p role="status" className="text-xs text-slate-400">{copied}</p>:null}
      </section>
      <p className="text-xs leading-6 text-slate-400">
        该测试只验证当前浏览器和网络条件。成功不代表授权、跨端兼容或其他影片可以播放；
        失败也可能由网络、编码、跨域或源服务器限制引起。
      </p>
    </main>
  );
}
