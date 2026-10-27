import { NextResponse } from 'next/server';
import { APPROVED_SOURCES, isSourceApproved, searchSourceHub } from '@/lib/sourcehub/core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('keyword')?.trim() || '';
  if (!query || query.length > 80) {
    return NextResponse.json({error:'invalid_keyword'}, {status:400,headers:{'Cache-Control':'private, no-store'}});
  }
  const today = new Date().toISOString().slice(0,10);
  const approved = APPROVED_SOURCES.filter(s => isSourceApproved(s,today));
  if (!approved.length) {
    return NextResponse.json({error:'sourcehub_no_approved_sources',items:[]},
      {status:503,headers:{'Cache-Control':'private, no-store'}});
  }
  const rows = await searchSourceHub(query,today,approved);
  // Source playback URLs may contain credentials; search results contain no URL.
  const items = rows.map(({lines,...item})=>({...item,lineCount:lines.length}));
  return NextResponse.json({items}, {headers:{'Cache-Control':'private, no-store'}});
}
