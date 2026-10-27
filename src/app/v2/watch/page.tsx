import { SourceWatchClient } from "@/components/webv2/source-watch-client";
export const dynamic="force-dynamic";
export default function WebV2Watch({searchParams}:{
  searchParams:{source?:string|string[];id?:string|string[]}
}){
  const source=typeof searchParams.source==="string"?searchParams.source:"";
  const id=typeof searchParams.id==="string"?searchParams.id:"";
  return <SourceWatchClient sourceId={source} workId={id}/>;
}
