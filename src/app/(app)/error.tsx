"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { SpotArt } from "@/components/art";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-[520px] px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-line bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:px-10">
        <SpotArt kind="rocket" className="mx-auto mb-4" />
        <div className="eyebrow mb-2">Something broke</div>
        <h1 className="m-0 mb-2 text-[24px] font-semibold tracking-[-0.02em]">This page did not load</h1>
        <p className="mx-auto mb-6 mt-0 max-w-[42ch] text-[15px] leading-[1.55] text-mute-1 text-pretty">Nothing you saved is lost. Try again, and if it keeps happening, send the team this reference:</p>
        <p className="mb-7 mt-0"><code className="rounded-md bg-chip px-2.5 py-1 font-code text-[13.5px] text-ink-3">{error.digest ?? "no reference"}</code></p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => retry()} className="inline-flex items-center gap-2 rounded-[9px] bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent transition hover:brightness-110">
            <RotateCw className="h-4 w-4" />Try again
          </button>
          <Link href="/" className="inline-flex items-center rounded-[9px] border border-line bg-white px-5 py-2.5 text-[15px] font-medium text-ink-3 transition-colors hover:border-line-strong hover:bg-wash">Go to the dashboard</Link>
        </div>
      </div>
    </div>
  );
}
