"use client";

import { Printer } from "lucide-react";
import { Btn } from "@/components/ui";

/** Top bar on the guidelines document. Hidden when printing. */
export function PrintBar({ title, back }: { title: string; back?: { href: string; label: string } }) {
  return (
    <div className="mx-auto flex max-w-[900px] items-center gap-3">
      {back && <a href={back.href} className="text-meta font-medium text-mute-1 hover:text-ink">← {back.label}</a>}
      <span className="min-w-0 flex-1 truncate text-meta font-semibold text-ink">{title}</span>
      <Btn variant="primary" size="sm" onClick={() => window.print()}>
        <Printer aria-hidden className="size-4" />Print or save as PDF
      </Btn>
    </div>
  );
}
