"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-[520px] px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card sm:px-10">
        <div className="eyebrow mb-2">Something broke</div>
        <h1 className="display m-0 mb-2 text-display">This page did not load</h1>
        <p className="mx-auto mb-6 mt-0 max-w-[42ch] text-body leading-[1.55] text-mute-1 text-pretty">Nothing you saved is lost. Try again, and if it keeps happening, send the team this reference:</p>
        <p className="mb-7 mt-0"><code className="rounded-md bg-chip px-2.5 py-1 font-code text-meta text-ink-3">{error.digest ?? "no reference"}</code></p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => retry()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-body font-semibold text-on-accent transition hover:brightness-110">
            <RotateCw className="h-4 w-4" />Try again
          </button>
          <Link href="/" className="inline-flex items-center rounded-lg border border-line bg-surface px-5 py-2.5 text-body font-medium text-ink-3 transition-colors hover:border-line-strong hover:bg-wash">Go to the dashboard</Link>
        </div>
      </div>
    </div>
  );
}
