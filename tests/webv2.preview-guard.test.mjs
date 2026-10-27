import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const config=readFileSync(new URL("../next.config.js",import.meta.url),"utf8");

test("a dedicated Vercel preview project and branch are required",()=>{
  assert.match(config,/prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX/);
  assert.match(config,/feature\/web-v2-migration-20261027/);
  assert.match(config,/VERCEL_TARGET_ENV === 'preview'/);
  assert.match(config,/VERCEL_ENV === 'preview'/);
  assert.match(config,/VERCEL_PROJECT_ID === WEB_V2_PROJECT_ID/);
  assert.match(config,/WEB_V2_PREVIEW_ONLY_BUILD_BLOCKED/);
});
