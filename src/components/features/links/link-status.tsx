"use client";

import { useState, useSyncExternalStore } from "react";
import type { Asset } from "@/db/schema";
import { checkLinkNow } from "@/app/link-actions";
import { useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { isLinkBroken, linkAdvice, linkCheckOf, linkProblem } from "@/lib/link-health";
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

/** Opens the asset's edit form, where its address is. Shared by the warning and the broken-links card. */
export function useEditLink() {
  const { ws, open } = useApp();
  return (a: Asset) => open({ kind: "asset", draft: { ...a, offerIds: ws.linkedOfferIds(a.id), copy: a.copy ?? { headline: "", body: "", cta: "" } }, step: 3 });
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
  const editLink = useEditLink();
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
  const canEdit = ws.canChange(asset);
  // A clear message, not a status code: what is wrong, what to do, and the buttons to do it.
  return (
    <div className={cx("rounded-xl border border-warn/40 bg-warn/8 px-4 py-3", className)}>
      <p className="m-0 flex items-center gap-2 text-body font-semibold text-warn-ink">
        <span aria-hidden className="size-2 flex-none rounded-full bg-warn" />
        {"This link doesn't open"}
      </p>
      <p className="m-0 mt-1 text-meta leading-[1.5] text-ink-3 text-pretty">
        <span className="font-semibold text-ink">{problem}{check.status ? ` (${check.status})` : ""}.</span> {linkAdvice(check, asset.url)}
      </p>
      <p className="m-0 mt-1 text-small text-mute-2">Checked <CheckedAt at={check.checkedAt} now={ws.d.now} /></p>
      {(canEdit || canCheck) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {canEdit && <Btn size="sm" onClick={() => editLink(asset)}>Edit link</Btn>}
          {canCheck && <Btn size="sm" disabled={pending} aria-busy={pending || undefined} onClick={() => again(asset.id)}>{pending ? "Checking…" : "Check again"}</Btn>}
        </div>
      )}
    </div>
  );
}
