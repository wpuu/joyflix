import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessMediaProgress, observedForwardPlayback, assessInitialSourceLoad,
} from "../src/lib/webv2/player/playback-health.ts";
import {
  preferNativeHls, hlsFailureLabel, playbackFailureCode, mediaErrorLabel,
} from "../src/lib/webv2/player/hls-playback-policy.ts";

test("port from TV: advancing playback must not be marked as a dead video",()=>{
  const media={currentTime:31,paused:false,seeking:false,ended:false,readyState:2};
  const history={previousTime:30.5,lastAdvancedAt:1000,waitingSince:1100};
  assert.deepEqual(assessMediaProgress(media,history,90000),
    {advanced:true,showBuffer:false,failOver:false});
});
test("port from TV: stalled video may fail over but not hidden/paused video",()=>{
  const history={previousTime:30,lastAdvancedAt:1000,waitingSince:1100};
  const media={currentTime:30,paused:false,seeking:false,ended:false,readyState:2};
  assert.equal(assessMediaProgress(media,history,25000).failOver,true);
  assert.equal(assessMediaProgress({...media,pageHidden:true},history,25000).failOver,false);
  assert.equal(assessMediaProgress({...media,paused:true},history,25000).failOver,false);
});
test("port from TV: a seek jump does not count as two seconds of real playback",()=>{
  assert.equal(observedForwardPlayback(0,60,false,false),0);
  assert.equal(observedForwardPlayback(0,1,false,false),1);
  assert.equal(observedForwardPlayback(20,21,false,true),0);
});
test("port from TV: mobile foreground initial loading has finite deadlines",()=>{
  assert.equal(assessInitialSourceLoad({startedAt:1000,now:30000,readyState:0,pageHidden:false}).failOver,true);
  assert.equal(assessInitialSourceLoad({startedAt:1000,now:30000,readyState:0,pageHidden:true}).failOver,false);
});
test("port from TV: hls.js preferred on MSE Android, native used on Safari",()=>{
  assert.equal(preferNativeHls(true,true,false),false);
  assert.equal(preferNativeHls(true,true,true),true);
  assert.equal(preferNativeHls(true,false,false),true);
});
test("port from TV: HLS failure labels identify stage without leaking raw URLs/tokens",()=>{
  const label=hlsFailureLabel({type:"networkError",details:"fragLoadError",
    response:{code:403,text:"SENSITIVE_TOKEN"},url:"https://private.example.org/secret.m3u8"});
  assert.match(label,/^HLS_SEGMENT_HTTP_403/);
  assert.doesNotMatch(label,/SENSITIVE_TOKEN|private\.example\.org/);
  assert.equal(playbackFailureCode(label),"HLS_SEGMENT_HTTP_403");
  assert.match(mediaErrorLabel(4),/VIDEO_FORMAT/);
});
