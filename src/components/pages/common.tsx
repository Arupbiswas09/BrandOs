"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackVisit } from "@/app/actions";
import { Page } from "@/components/ui";

/** Remembers where you have been so the Street can offer it back. */
export function useVisit(kind: "brand" | "offer" | "service" | "client", id: string | undefined, ok = true) {
  useEffect(() => {
    if (id && ok) void trackVisit(kind, id);
  }, [kind, id, ok]);
}

export function NotHere({ what }: { what: string }) {
  return (
    <Page>
      <div className="mx-auto mt-16 max-w-[420px] rounded-[14px] border border-dashed border-line-strong p-10 text-center">
        <div className="mb-1.5 text-[16px] font-semibold">This {what} is not here</div>
        <div className="mb-5 text-[15px] leading-[1.55] text-mute-2">It was deleted, or it belongs to a client you cannot see. Ask an admin if you think you should.</div>
        <Link href="/" className="text-[15px] font-semibold text-accent hover:underline">Back to the Street</Link>
      </div>
    </Page>
  );
}
