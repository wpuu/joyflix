import { NextResponse } from 'next/server';
import { APPROVED_SOURCES, detailSourceHub, previewOpenFilmById, previewOpenFilmsEnabled } from '@/lib/sourcehub/core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const source = p.get('source') || '', id = p.get('id') || '';
  if (!/^[a-z0-9_-]{2,40}$/i.test(source) || !/^[a-zA-Z0-9_-]{1,96}$/.test(id)) {
    return NextResponse.json({error:'invalid_source_or_id'},
      {status:400,headers:{'Cache-Control':'private, no-store'}});
  }
  const today = new Date().toISOString().slice(0,10);
  const preview = previewOpenFilmById(source,id,process.env,today);
  if(preview){
    return NextResponse.json({item:preview},{headers:{'Cache-Control':'private, no-store'}});
  }
  if (!APPROVED_SOURCES.length && !previewOpenFilmsEnabled(process.env)) {
    return NextResponse.json({error:'sourcehub_no_approved_sources'},
      {status:503,headers:{'Cache-Control':'private, no-store'}});
  }
  const item = APPROVED_SOURCES.length
    ? await detailSourceHub(source,id,today) : null;
  return item
    ? NextResponse.json({item},{headers:{'Cache-Control':'private, no-store'}})
    : NextResponse.json({error:'not_found'},{status:404,headers:{'Cache-Control':'private, no-store'}});
}
