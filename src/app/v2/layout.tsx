import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "观影指南 Web V2｜独立片源预览",
  description: "隔离中的 Web V2 源管理与播放页面；只显示经过批准的来源",
  robots: {index:false,follow:false,noimageindex:true}
};

export default function WebV2Layout({children}: {children:ReactNode}) {
  return (
    <section data-web-v2="true" className="min-h-screen bg-[#11151c] text-slate-100">
      {children}
    </section>
  );
}
