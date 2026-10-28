import {test} from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_SOURCES,groupSourcehubFilms,
  previewOpenFilmsEnabled,previewOpenFilms,searchPreviewOpenFilms,previewOpenFilmById,
  isSourceApproved
} from "../src/lib/sourcehub/core.ts";
const env={
  NODE_ENV:"production",VERCEL:"1",VERCEL_ENV:"preview",VERCEL_TARGET_ENV:"preview",
  VERCEL_PROJECT_ID:"prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX",
  VERCEL_GIT_COMMIT_REF:"feature/web-v2-migration-20261027"
};
const today="2026-10-28";

test("two actual CC BY complete open films exist only in the exact private preview",()=>{
  assert.deepEqual(APPROVED_SOURCES,[]);
  assert.equal(previewOpenFilmsEnabled(env),true);
  const films=previewOpenFilms(env,today);
  assert.deepEqual(films.map(f=>f.workId),["spring2019","bunny2008"]);
  assert.equal(films.length,2);
  for(const film of films){
    assert.equal(film.previewOnly,true);
    assert.equal(film.lines.length,1);
    assert.equal(film.lines[0].episodes.length,1);
    const episode=film.lines[0].episodes[0];
    assert.equal(episode.format,"webm");
    assert.equal(new URL(episode.mediaUrl).hostname,"upload.wikimedia.org");
    assert.equal(film.rights.evidenceUrl.startsWith("https://"),true);
    assert.equal(film.rights.licenseUrl.includes("creativecommons.org/licenses/by/"),true);
    assert.equal(film.rights.credit.includes("Blender Foundation"),true);
  }
});
test("production, foreign project/branch, date expiry and untrusted staging have zero demo films",()=>{
  for(const denied of [
    {...env,VERCEL_ENV:"production",VERCEL_TARGET_ENV:"production"},
    {...env,VERCEL_PROJECT_ID:"prj_EUzmQpHGHpDZy6VDHZ2ao8LInC10"},
    {...env,VERCEL_GIT_COMMIT_REF:"main"},
    {...env,VERCEL_TARGET_ENV:"production"},
    {...env,VERCEL_ENV:"development"},
    {NODE_ENV:"production"},
  ]){
    assert.equal(previewOpenFilmsEnabled(denied),false);
    assert.deepEqual(previewOpenFilms(denied,today),[]);
  }
  assert.deepEqual(previewOpenFilms(env,"2027-01-01"),[]);
});
test("only exact approved works return media; no title guessing or unknown files",()=>{
  const spring=previewOpenFilmById("blender-spring","spring2019",env,today);
  const bunny=previewOpenFilmById("blender-bunny","bunny2008",env,today);
  assert.equal(spring.year,2019);
  assert.equal(bunny.year,2008);
  assert.equal(spring.rights.licenseName,"CC BY 4.0");
  assert.equal(bunny.rights.licenseName,"CC BY 3.0");
  assert.equal(previewOpenFilmById("blender-spring","bunny2008",env,today),null);
  assert.equal(previewOpenFilmById("unknown","spring2019",env,today),null);
});
test("search and featured lists contain group identity only, never video URL/token",()=>{
  const films=searchPreviewOpenFilms("spring",env,today);
  assert.deepEqual(films.map(f=>f.workId),["spring2019"]);
  assert.equal(searchPreviewOpenFilms("big buck bunny",env,today).length,1);
  assert.equal(searchPreviewOpenFilms("春",env,today).length,1);
  assert.deepEqual(searchPreviewOpenFilms("unavailable-title",env,today),[]);
  const grouped=groupSourcehubFilms(previewOpenFilms(env,today));
  assert.equal(grouped.length,2);
  assert.doesNotMatch(JSON.stringify(grouped),/wikimedia|\.webm|mediaUrl|copyright|token=/i);
  assert.equal(grouped[0].sourceCount,1);
});
