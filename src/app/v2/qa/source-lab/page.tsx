import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {sourceLabEnabled} from "@/lib/webv2/source-lab";
import {SourceLabClient} from "@/components/webv2/source-lab-client";

export const dynamic="force-dynamic";
export const metadata: Metadata={
  title:"个人片源实验室｜Web V2",
  robots:{index:false,follow:false,noimageindex:true}
};
export default function SourceLabPage(){
  if(!sourceLabEnabled(process.env))notFound();
  return <SourceLabClient/>;
}
