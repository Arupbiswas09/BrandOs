"use client";

import { useSyncExternalStore } from "react";
import { fmtDateTime } from "@/lib/format";

const noop = () => () => {};

/**
 * A date and time in the reader's own timezone, 24-hour ("16 Oct 2026, 14:30").
 * The server cannot know that timezone, so it renders a blank and the browser
 * fills the time in straight after hydrating.
 */
export function LocalTime({ at, className }: { at: number | string | Date; className?: string }) {
  const browser = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(at);
  return <time dateTime={d.toISOString()} className={className}>{browser ? fmtDateTime(d) : " "}</time>;
}
