/**
 * Actual licensed film playback on the real Next.js /v2 -> /v2/watch UI.
 * Browser runs on 127.0.0.1, video bytes come directly from Wikimedia Commons
 * with rights cited in core.ts. No token, source URL, cookie or media bytes logged.
 * This is CI in a US runner, NOT mainland/iOS/production verification.
 */
import {createRequire} from "node:module";
const require=createRequire("/tmp/web-v2-selenium/package.json");
const {Builder,By}=require("selenium-webdriver");
const chrome=require("selenium-webdriver/chrome");

const base="http://127.0.0.1:3189";
const cases=[
  {id:"spring",source:"blender-spring",work:"spring2019",expectedDuration:450},
  {id:"bunny",source:"blender-bunny",work:"bunny2008",expectedDuration:570}
];
const opts=new chrome.Options().addArguments(
  "--headless=new","--no-sandbox","--disable-dev-shm-usage",
  "--autoplay-policy=no-user-gesture-required","--window-size=1040,900"
);
let driver;
const results=[];
const query=async()=>driver.executeScript(()=>{
 const v=document.querySelector("video");
 return {
  exists:!!v,
  time:v?.currentTime??0,
  duration:Number.isFinite(v?.duration)?v.duration:null,
  ready:v?.readyState??-1,width:v?.videoWidth??0,height:v?.videoHeight??0,
  error:v?.error?.code??0,paused:v?.paused??true,
  startError:window.__filmStartError??null,
  confirmed:document.body.innerText.includes("已观察到至少2秒真实视频播放")
 };
});

try{
  driver=await new Builder().forBrowser("chrome").setChromeOptions(opts).build();
  await driver.manage().setTimeouts({pageLoad:20000,script:12000,implicit:0});
  for(const film of cases){
    const obs={
      title:film.id,searchFound:false,detailLoaded:false,preOptInNoVideo:false,
      firstFrameTwoSeconds:false,seekSixtySeconds:false,durationSeconds:null,
      actualNextPage:true,country:"US GitHub runner",fullFilmWatched:false
    };
    try{
      await driver.get(base+"/v2");
      const featured=await driver.wait(async()=>{
        const links=await driver.findElements(By.css("a[href*='/v2/watch?']"));
        return links.length>=2;
      },15000,"two featured licensed movies did not render");
      if(!featured)throw Error("featured not rendered");
      const link=await driver.findElement(By.css('a[href*="source='+film.source+'"]'));
      obs.searchFound=true;
      await link.click();
      await driver.wait(async()=>{
        const buttons=await driver.findElements(By.xpath('//button[contains(., "加载并播放")]'));
        return buttons.length>0;
      },15000,"detail screen missing opt-in control");
      const before=await query();
      obs.preOptInNoVideo=!before.exists;
      if(!obs.preOptInNoVideo)throw Error("media loaded without consent");
      obs.detailLoaded=true;
      await driver.findElement(By.xpath('//button[contains(., "加载并播放")]')).click();
      await driver.wait(async()=>(await query()).exists,12000,"video element absent after click");
      await driver.executeScript(()=>{
        const v=document.querySelector("video");
        void v.play().catch(err=>{window.__filmStartError=err?.name??"unknown"});
      });
      await driver.wait(async()=>{
        const q=await query();
        if(q.error || q.startError)throw Error("browser video load/decode error");
        return q.time>=2.1 && q.width>0 && q.ready>=3 && !q.paused && q.confirmed;
      },50000,"real Next player did not advance two seconds");
      obs.firstFrameTwoSeconds=true;
      const after=await query();
      obs.durationSeconds=after.duration!==null?Math.round(after.duration):null;
      if(!after.duration || after.duration<film.expectedDuration)throw Error("incomplete media duration");
      await driver.executeScript(()=>{
        const v=document.querySelector("video");
        v.currentTime=60;
        void v.play().catch(err=>{window.__filmSeekError=err?.name??"unknown"});
      });
      await driver.wait(async()=>{
        const q=await query();
        if(q.error)throw Error("media error after seek");
        return q.time>=61.2 && q.ready>=3 && !q.paused;
      },45000,"real Next player did not recover from seek");
      obs.seekSixtySeconds=true;
    }catch(error){
      obs.failureClass=String(error?.name||"unknown");
      obs.failureStage=obs.firstFrameTwoSeconds?"seek_or_duration":
        obs.detailLoaded?"first_frame":"navigation_or_detail";
    }finally{
      try{await driver.executeScript(()=>{
        const v=document.querySelector("video");
        if(v){v.pause();v.removeAttribute("src");v.load();}
      })}catch{}
      results.push(obs);
      console.log(JSON.stringify(obs));
    }
  }
}finally{
  try{await driver?.quit()}catch{}
}
const pass=results.filter(x=>x.firstFrameTwoSeconds && x.seekSixtySeconds).length;
console.log("WEB_V2_OPEN_FILMS_REAL_NEXT_CHROME_PASS="+pass+"/"+cases.length);
if(pass!==cases.length)process.exitCode=2;
