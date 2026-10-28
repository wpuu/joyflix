/**
 * Exercise real cross-origin browser CORS import of a PINNED real TVBox
 * single-repo configuration. Never request the 160 third-party sites or
 * any video bytes in this test. No URLs, tokens, config bodies in CI output.
 */
import {createRequire} from "node:module";
const require=createRequire("/tmp/web-v2-selenium/package.json");
const {Builder,By}=require("selenium-webdriver");
const chrome=require("selenium-webdriver/chrome");
const base="http://127.0.0.1:3193";
const fixed="https://raw.githubusercontent.com/TVboxorg/TVbox/0bb8a8061b41dd79276a601830f854792f5e348a/dist/official.json";
let browser;
const out={configFetched:false,sitesRecognized:false,eligibleSourceCount:0,
  blockedSpider:true,noSourceProbes:false,noVideo:false,remoteInputCleared:false,
  browser:"US GitHub Chrome",actualCMSProbed:false,actualFilmPlayed:false};
try{
  const opts=new chrome.Options().addArguments(
    "--headless=new","--no-sandbox","--disable-dev-shm-usage","--window-size=1150,950"
  );
  browser=await new Builder().forBrowser("chrome").setChromeOptions(opts).build();
  await browser.manage().setTimeouts({pageLoad:25000,script:12000,implicit:0});
  await browser.get(base+"/v2/qa/source-lab");
  await browser.wait(async()=>Boolean((await browser.findElements(By.id("tvbox-remote-url"))).length),14000);
  await browser.executeScript(()=>{
    const original=window.fetch.bind(window);
    window.__v2RemoteProbe={config:0,thirdParty:0};
    window.fetch=(input,init)=>{
      const url=typeof input==="string"?input:input?.url??"";
      if(url.includes("raw.githubusercontent.com/TVboxorg/TVbox/"))
        window.__v2RemoteProbe.config++;
      else if(/^https?:\/\//.test(url) && !url.startsWith(window.location.origin))
        window.__v2RemoteProbe.thirdParty++;
      return original(input,init);
    };
  });
  await browser.findElement(By.id("tvbox-remote-url")).sendKeys(fixed);
  const before=await browser.executeScript(()=>window.__v2RemoteProbe.config);
  if(before!==0)throw Error("remote fetched before explicit action");
  await browser.findElement(By.xpath('//button[contains(.,"手动读取远程 TVBox 配置")]')).click();
  await browser.wait(async()=>{
    const text=await browser.executeScript(()=>document.body.innerText);
    return text.includes("已读取并分析 ") || text.includes("远程配置读取失败") ||
      text.includes("源站不允许浏览器跨域读取");
  },40000);
  const metrics=await browser.executeScript(()=>{
    const info=document.body.innerText;
    const cnt=info.match(/已读取并分析\s+(\d+)\s+个站点/);
    const eligible=info.match(/只看可手动测试的 JSON HTTP（(\d+)个）/);
    return {
      config:window.__v2RemoteProbe.config,
      thirdParty:window.__v2RemoteProbe.thirdParty,
      sites:cnt?Number(cnt[1]):0,
      eligible:eligible?Number(eligible[1]):0,
      hasSpiderProbing:!!document.querySelector('button[aria-label*="执行Spider"]'),
      video:!!document.querySelector("video"),
      input:document.getElementById("tvbox-remote-url")?.value??"missing",
      failure:info.includes("源站不允许浏览器跨域读取")?"cors_or_network":
        info.includes("远程配置读取失败")?"source_error":"unknown_or_success"
    };
  });
  out.configFetched=metrics.config===1;
  out.sitesRecognized=metrics.sites===160;
  out.eligibleSourceCount=metrics.eligible;
  out.blockedSpider=!metrics.hasSpiderProbing;
  out.noSourceProbes=metrics.thirdParty===0;
  out.noVideo=!metrics.video;
  out.remoteInputCleared=metrics.input==="";
  if(!out.configFetched||!out.sitesRecognized||metrics.eligible<5||
    !out.blockedSpider||!out.noSourceProbes||!out.noVideo||!out.remoteInputCleared){
    out.failureCategory=metrics.failure;
    throw Error("real remote CORS read/classification gate not satisfied");
  }
}catch(err){
  out.failureStage="real_browser_remote_config";
  out.failureClass=String(err?.name||"unknown");
  process.exitCode=2;
}finally{
  try{await browser?.quit()}catch{}
  console.log(JSON.stringify(out));
}
const ok=out.configFetched&&out.sitesRecognized&&out.eligibleSourceCount>=5&&
  out.blockedSpider&&out.noSourceProbes&&out.noVideo&&out.remoteInputCleared;
console.log("WEB_V2_PINNED_REAL_TVBOX_CORS_IMPORT="+(ok?"PASS":"UNVERIFIED"));
if(!ok)process.exitCode=2;
