"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";
import { fmtNumber } from "@/lib/format";
import { MIN_LEADS, pct, totalsOf } from "@/lib/results";

/**
 * "11.7% conv." for an offer row or card: conversion over every recorded
 * period. Shows nothing until a period records both leads and conversions.
 * Fewer than MIN_LEADS leads reads quieter, because the rate means little yet.
 */
export function ResultBadge({ offerId, className }: { offerId: string; className?: string }) {
  const { ws } = useApp();
  const t = useMemo(() => totalsOf(ws.d.offerResults.filter((r) => r.offerId === offerId)), [ws, offerId]);
  if (t.conversion === null) return null;
  const few = t.rateLeads < MIN_LEADS;
  const said = `${pct(t.conversion)} of ${fmtNumber(t.rateLeads)} leads converted${few ? ", too few leads to compare yet" : ""}`;
  return (
    <span title={said} className={cx("inline-flex flex-none items-center whitespace-nowrap rounded-sm px-1.5 py-0.5 text-small font-semibold leading-[1.35] tabular-nums", few ? "border border-line text-mute-2" : "bg-chip text-ink-3", className)}>
      <span aria-hidden>{pct(t.conversion)} conv.</span>
      <span className="sr-only">{said}</span>
    </span>
  );
}
