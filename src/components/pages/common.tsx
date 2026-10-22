"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackVisit } from "@/app/actions";
import { Page } from "@/components/ui";
import { linkBtn } from "@/components/link-button";

/** Remembers where you have been so the Street can offer it back. */
export function useVisit(kind: "brand" | "offer" | "service" | "client", id: string | undefined, ok = true) {
  useEffect(() => {
    if (id && ok) void trackVisit(kind, id);
  }, [kind, id, ok]);
}

export function NotHere({ what }: { what: string }) {
  return (
    <Page>
      <div className="mx-auto mt-16 max-w-[420px] rounded-xl border border-dashed border-line-strong p-10 text-center">
        <div className="mb-1.5 text-lead font-semibold">This {what} is not here</div>
        <div className="mb-5 text-body leading-[1.55] text-mute-2">The link may be old, or it belongs to a client you cannot see. Ask an admin if you think you should.</div>
        <Link href="/" className={linkBtn("secondary", "md")}>Back to the Dashboard</Link>
      </div>
    </Page>
  );
}
