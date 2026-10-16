"use client";

import { useState, useSyncExternalStore } from "react";
import type { Asset } from "@/db/schema";
import { checkLinkNow } from "@/app/link-actions";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { isLinkBroken, linkCheckOf, linkProblem } from "@/lib/link-health";
import { useRun } from "./use-run";

/*
 * "Link not responding": shown only when the last check of an asset's
 * current address failed. Nothing at all when the link opens or was never
 * checked, so healthy work stays quiet.
 */

const noop = () => () => {};

/** "16 Oct, 09:00" in the reader's own timezone. Blank on the server, which cannot know it, then filled in at once. */
export function CheckedAt({ at, now }: { at: string; now?: number }) {
  const browser = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(at);
  return <time dateTime={d.toISOString()}>{browser ? `${fmtDate(d, { short: true, now })}, ${fmtTime(d)}` : " "}</time>;
}

/** "Link not responding (404)". */
export function notRespondingLabel(status: number | null | undefined) {
  return `Link not responding${status ? ` (${status})` : ""}`;
}

/** Checks one asset's link again and says how it went. Shared by the status line and the broken-links card. */
export function useCheckAgain() {
  const { toast } = useApp();
  const [run, pending] = useRun();
  const [busyId, setBusyId] = useState<string | null>(null);
  const again = async (assetId: string) => {
    setBusyId(assetId);
    const r = await run(() => checkLinkNow(assetId));
    setBusyId(null);
    if (!r) return;
    if (r.check.ok) toast("The link opens again");
    else toast(`Still not responding: ${linkProblem(r.check)}${r.check.status ? ` (${r.check.status})` : ""}`, "info");
  };
  return { again, pending, busyId };
}

/**
 * The warning for one asset.
 *   line   a calm strip with what failed, when, and "Check again" (drawer header, list rows)
 *   badge  a small label with no button, safe inside a card that is itself a button
 */
export function LinkStatus({ asset, variant = "line", className }: { asset: Asset; variant?: "line" | "badge"; className?: string }) {
  const { ws } = useApp();
  const { again, pending } = useCheckAgain();
  if (!isLinkBroken(asset)) return null;
  const check = linkCheckOf(asset)!;
  const problem = linkProblem(check);
  const label = notRespondingLabel(check.status);

  if (variant === "badge") {
    return (
      <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-sm bg-warn/10 px-1.5 py-0.5 text-small font-semibold leading-[1.35] text-warn-ink", className)} title={`${label}: ${problem}`}>
        <span aria-hidden className="size-1.5 flex-none rounded-full bg-warn" />
        <span className="truncate">Link not responding</span>
        <span className="sr-only">: {problem}{check.status ? ` (${check.status})` : ""}</span>
      </span>
    );
  }

  const canCheck = ws.can("edit");
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn/35 bg-warn/8 px-3 py-2", className)}>
      <span aria-hidden className="size-1.5 flex-none rounded-full bg-warn" />
      <p className="m-0 min-w-0 flex-1 text-meta leading-[1.45] text-warn-ink">
        <span className="font-semibold">{label}</span>
        {(check.error || !check.status) && <> · {problem}</>}
        <span className="text-warn-text"> · checked <CheckedAt at={check.checkedAt} now={ws.d.now} /></span>
      </p>
      {canCheck && (
        <button type="button" disabled={pending} onClick={() => again(asset.id)}
          className="-my-1 min-h-7 flex-none rounded-sm px-1 text-meta font-semibold text-warn-ink underline-offset-2 hover:underline disabled:cursor-wait disabled:opacity-60">
          {pending ? "Checking…" : "Check again"}
        </button>
      )}
    </div>
  );
}
