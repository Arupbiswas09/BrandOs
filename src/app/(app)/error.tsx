"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-[460px] px-6 py-24 text-center">
      <div className="eyebrow mb-3">Something broke</div>
      <h1 className="m-0 mb-2 font-serif text-[30px] font-normal tracking-[-0.02em]">This page did not load</h1>
      <p className="mb-6 mt-0 text-[16px] leading-[1.55] text-mute-1">Nothing you saved is lost. Try again, and if it keeps happening, send the team this reference: <span className="font-mono text-[14.5px]">{error.digest ?? "no reference"}</span></p>
      <button type="button" onClick={reset} className="rounded-[9px] bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent hover:brightness-110">Try again</button>
    </div>
  );
}
