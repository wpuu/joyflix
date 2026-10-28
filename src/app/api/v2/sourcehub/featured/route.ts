import {NextResponse} from "next/server";
import {groupSourcehubFilms,previewOpenFilms,previewOpenFilmsEnabled} from "@/lib/sourcehub/core";

export const dynamic="force-dynamic";
export const runtime="nodejs";

/** No public samples, no media URLs in list data, no source fallback. */
export async function GET(){
  const headers={"Cache-Control":"private, no-store"};
  if(!previewOpenFilmsEnabled(process.env)){
    return NextResponse.json({error:"preview_only"},{status:404,headers});
  }
  const today=new Date().toISOString().slice(0,10);
  return NextResponse.json({items:groupSourcehubFilms(previewOpenFilms(process.env,today))},{headers});
}
