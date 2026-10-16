"use client";

import type { Asset } from "@/db/schema";
import { REVIEW_COLOR } from "@/lib/constants";
import { approveItem } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";

/*
 * Where an offer or asset stands, said once: a status picker and one review
 * line ("In review with Dana for 3 days"), with the next step beside it.
 */

type Reviewable = Pick<Asset, "id" | "review" | "reviewerId" | "ownerId" | "updatedAt">;

/** "3 days" from "3 days ago"; nothing when it only just happened. */
function waited(ago: string) {
  if (ago === "just now") return null;
  if (ago === "yesterday") return "a day";
  return ago.replace(/ ago$/, "");
}

const LINK = "inline-flex h-7 flex-none items-center rounded-lg px-1.5 text-meta font-medium text-accent transition-colors hover:bg-soft disabled:opacity-50";

export function ReviewLine({ kind, item, className }: { kind: "asset" | "offer"; item: Reviewable; className?: string }) {
  const { ws, open } = useApp();
  const [run, pending] = useAction();
  const name = (id: string | null) => (id === ws.me.id ? "you" : id ? ws.first(id) : null);
  const by = name(item.reviewerId);
  const ago = ws.ago(item.updatedAt);
  const canChange = ws.canChange(item);
  const inReview = item.review === "In review";
  // Approve and Request changes only while it is actually waiting for a review.
  const canReview = inReview && ws.can("review");

  let text: string;
  if (item.review === "In review") {
    const long = waited(ago);
    text = by ? `In review with ${by}${long ? ` for ${long}` : ""}` : "In review";
  } else if (item.review === "Changes requested") {
    text = `Changes requested${by ? ` by ${by}` : ""}, ${ago}`;
  } else if (item.review === "Approved") {
    text = `Approved${by ? ` by ${by}` : ""}, ${ago}`;
  } else {
    text = "Not reviewed";
  }
  const send = () => open({ kind: "sendReview", item: kind, id: item.id });

  return (
    <div className={cx("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5", className)}>
      <span className="inline-flex min-w-0 items-center gap-2 text-meta text-ink-3">
        <span aria-hidden className="size-2 flex-none rounded-full" style={{ background: REVIEW_COLOR[item.review] }} />
        <span className="min-w-0">{text}</span>
      </span>
      {canChange && !inReview && (
        <button type="button" disabled={pending} onClick={send} className={LINK}>{item.review === "Approved" ? "Review again" : "Send for review"}</button>
      )}
      {canChange && inReview && <button type="button" disabled={pending} onClick={send} className={LINK}>Reassign</button>}
      {canReview && (
        <span className="flex basis-full flex-wrap gap-2 pt-0.5">
          <Btn size="sm" variant="change" disabled={pending} onClick={() => open({ kind: "reqChanges", item: kind, id: item.id })}>Request changes</Btn>
          <Btn size="sm" variant="approve" disabled={pending} onClick={() => run(approveItem, kind, item.id)}>Approve</Btn>
        </span>
      )}
    </div>
  );
}

/** A status as one compact select, its colour as a dot beside the word. Read-only people see the word. */
export function StatusSelect<S extends string>({ value, colors, onChange, disabled, label = "Status", readOnly }: {
  value: S; colors: Record<S, string>; onChange: (v: S) => void; disabled?: boolean; label?: string; readOnly?: boolean;
}) {
  const dot = <span aria-hidden className="size-2 flex-none rounded-full" style={{ background: colors[value] ?? "#93A09A" }} />;
  if (readOnly) return <span className="inline-flex items-center gap-2 text-meta text-ink-3">{dot}{value}</span>;
  return (
    <span className="relative inline-flex max-w-full items-center">
      <span className="pointer-events-none absolute left-2.5 flex">{dot}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as S)}
        className="field h-8 w-auto max-w-full py-0 pl-6 pr-8 text-meta"
      >
        {(Object.keys(colors) as S[]).map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
    </span>
  );
}
