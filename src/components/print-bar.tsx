"use client";

import { Printer } from "lucide-react";

/** Top bar on the guidelines document. Hidden when printing. */
export function PrintBar({ title, back }: { title: string; back?: { href: string; label: string } }) {
  return (
    <div className="mx-auto flex max-w-[900px] items-center gap-3">
      {back && <a href={back.href} className="text-meta font-medium text-[#46534D] hover:text-[#101614]">← {back.label}</a>}
      <span className="min-w-0 flex-1 truncate text-meta font-semibold text-[#101614]">{title}</span>
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2D4A5C] px-3.5 py-2 text-meta font-semibold text-white hover:brightness-110">
        <Printer className="h-4 w-4" />Print or save as PDF
      </button>
    </div>
  );
}
