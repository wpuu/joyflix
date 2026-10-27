"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  preferNativeHls, hlsFailureLabel, mediaErrorLabel,
} from "@/lib/webv2/player/hls-playback-policy";
import { observedForwardPlayback } from "@/lib/webv2/player/playback-health";

export function SourceVideoV2({url,onFailure}:{
  url:string;
  onFailure:(reason:string)=>void;
}){
  const videoRef=useRef<HTMLVideoElement>(null);
  const failureRef=useRef(onFailure);
  const [verified,setVerified]=useState(false);
  failureRef.current=onFailure;
  useEffect(()=>{
    const video=videoRef.current;
    if(!video)return;
    let active=true;
    let hls:Hls|null=null;
    let oldTime:number|null=null;
    let forward=0;
    const fail=(reason:string)=>{if(active)failureRef.current(reason);};
    const onVideoError=()=>fail(mediaErrorLabel(video.error?.code));
    const onSeek=()=>{oldTime=null;};
    const onUpdate=()=>{
      const delta=observedForwardPlayback(oldTime,video.currentTime,video.paused,video.seeking);
      if(delta>0)forward+=delta;
      oldTime=video.currentTime;
      if(forward>=2 && video.videoWidth>0 && video.readyState>=3)setVerified(true);
    };
    video.addEventListener("error",onVideoError);
    video.addEventListener("seeking",onSeek);
    video.addEventListener("seeked",onSeek);
    video.addEventListener("timeupdate",onUpdate);
    video.pause();

    try{
      const media=new URL(url);
      if(media.pathname.toLowerCase().endsWith(".m3u8")){
        const native=Boolean(video.canPlayType("application/vnd.apple.mpegurl")||
          video.canPlayType("application/x-mpegURL"));
        if(preferNativeHls(native,typeof window.MediaSource!=="undefined",
          "ManagedMediaSource" in window)){
          video.src=url;
        }else if(Hls.isSupported()){
          hls=new Hls({enableWorker:true});
          hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)fail(hlsFailureLabel(data));});
          hls.loadSource(url);
          hls.attachMedia(video);
        }else if(native){
          video.src=url;
        }else{
          fail("HLS_UNSUPPORTED：该浏览器不支持 HLS 视频。");
        }
      }else{
        video.src=url;
      }
    }catch{fail("VIDEO_URL_INVALID：地址格式错误。");}
    return()=>{
      active=false;
      hls?.destroy();
      video.removeEventListener("error",onVideoError);
      video.removeEventListener("seeking",onSeek);
      video.removeEventListener("seeked",onSeek);
      video.removeEventListener("timeupdate",onUpdate);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  },[url]);
  return (
    <div>
      <video ref={videoRef} controls playsInline preload="none"
        className="aspect-video w-full bg-black" aria-label="已批准来源的视频播放器"/>
      <p role="status" className="mt-2 text-xs text-slate-400">
        {verified?"已观察到至少2秒真实视频播放":"尚未确认真实首帧或连续播放"}
      </p>
    </div>
  );
}
