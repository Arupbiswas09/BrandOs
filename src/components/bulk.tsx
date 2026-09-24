"use client";

import { useState, useTransition } from "react";
import type { Asset } from "@/db/schema";
import { bulkAssets, type BulkOp, type BulkPayload, type BulkResult } from "@/app/actions";
import { useApp } from "@/components/app/provider";
import { ASSET_STATUS } from "@/lib/constants";
import type { WS } from "@/lib/ws";
import { Btn, cx } from "@/components/ui";

/** Select mode for a grid of asset cards: which ones are ticked, and whether ticking is on at all. */
export function useSelection() {
  const [on, setOn] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  return {
    on,
    sel,
    start: () => setOn(true),
    stop: () => { setOn(false); setSel(new Set()); },
    toggle: (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    set: (ids: string[]) => setSel(new Set(ids)),
  };
}
export type Selection = ReturnType<typeof useSelection>;

/** What this person may do to many assets at once. The server checks every item again. */
export function bulkPerms(ws: WS, library: boolean) {
  const edit = ws.can("edit") && (!library || ws.can("library"));
  return {
    archive: ws.can("archive"),
    edit,
    publish: edit && ws.can("publish"),
    // Library items are never shown to clients, so there is nothing to clear.
    share: ws.can("share") && !library,
    del: ws.can("del"),
  };
}
export const canBulk = (ws: WS, library: boolean) => Object.values(bulkPerms(ws, library)).some(Boolean);

const DONE_VERB: Partial<Record<BulkOp, string>> = { delete: "Deleted", archive: "Archived", restore: "Restored", review: "Sent" };

/** "Updated 7 · 2 skipped (not yours)" */
export function bulkMessage(r: Extract<BulkResult, { ok: true }>, op: BulkOp): { text: string; tone: "ok" | "error" } {
  const reasons = new Map<string, number>();
  r.skipped.forEach((s) => reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1));
  const why = [...reasons].map(([reason, n]) => (reasons.size > 1 ? `${n} ${reason}` : reason)).join(", ");
  const head = r.done ? `${DONE_VERB[op] ?? "Updated"} ${r.done}${op === "review" ? " for review" : ""}` : "Nothing changed";
  return { text: r.skipped.length ? `${head} · ${r.skipped.length} skipped (${why})` : head, tone: r.done ? "ok" : "error" };
}

/** Runs one bulk change, toasts the outcome, and keeps the skipped ones ticked so they can be dealt with. */
export function useBulk(onDone: (keep: string[]) => void) {
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const go = (ids: string[], op: BulkOp, payload?: BulkPayload) =>
    new Promise<boolean>((resolve) => {
      start(async () => {
        try {
          const r = await bulkAssets(ids, op, payload);
          if (!r.ok) { toast(r.error, "error"); resolve(false); return; }
          const m = bulkMessage(r, op);
          toast(m.text, m.tone);
          onDone(r.skipped.map((s) => s.id));
          resolve(true);
        } catch {
          toast("Something went wrong. Try again.", "error");
          resolve(false);
        }
      });
    });
  return [go, pending] as const;
}

type Panel = null | "status" | "due" | "tag";

/**
 * The bar that follows you down the page in select mode: how many are ticked,
 * "select all shown", and only the changes this person's role allows.
 */
export function BulkBar({ s, shown, library = false }: { s: Selection; shown: Asset[]; library?: boolean }) {
  const { ws, open } = useApp();
  const picked = shown.filter((a) => s.sel.has(a.id));
  const ids = picked.map((a) => a.id);
  const [go, pending] = useBulk((keep) => s.set(keep));
  const [panel, setPanel] = useState<Panel>(null);
  const [date, setDate] = useState("");
  const [tag, setTag] = useState("");
  const p = bulkPerms(ws, library);
  const none = !ids.length || pending;
  const all = shown.length > 0 && picked.length === shown.length;
  const flip = (x: Panel) => setPanel(panel === x ? null : x);
  const run = async (op: BulkOp, payload?: BulkPayload) => { if (await go(ids, op, payload)) setPanel(null); };

  return (
    <div role="region" aria-label="Bulk actions" className="sticky bottom-3 z-30 mt-5 rounded-[14px] border border-line bg-white/95 px-3 py-2.5 shadow-[0_12px_32px_rgba(16,22,20,.16)] backdrop-blur-[8px] sm:px-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-[15px] font-semibold" aria-live="polite">{picked.length} selected</span>
        <Btn size="sm" variant="ghost" disabled={!shown.length} onClick={() => s.set(all ? [] : shown.map((a) => a.id))}>
          {all ? "Clear selection" : `Select all shown (${shown.length})`}
        </Btn>
        <span className="hidden flex-1 sm:block" />
        <div className="flex flex-wrap items-center gap-1.5">
          {p.edit && <Btn size="sm" disabled={none} aria-expanded={panel === "status"} onClick={() => flip("status")}>Status ▾</Btn>}
          {p.edit && <Btn size="sm" disabled={none} aria-expanded={panel === "due"} onClick={() => flip("due")}>Due date</Btn>}
          {p.edit && <Btn size="sm" disabled={none} onClick={() => open({ kind: "bulkReview", ids, onDone: (keep) => s.set(keep) })}>Send for review</Btn>}
          {p.edit && <Btn size="sm" disabled={none} aria-expanded={panel === "tag"} onClick={() => flip("tag")}>Add tag</Btn>}
          {p.share && <Btn size="sm" disabled={none} onClick={() => run("clear")}>Cleared to send</Btn>}
          {p.archive && picked.some((a) => !a.archived) && <Btn size="sm" disabled={none} onClick={() => run("archive")}>Archive</Btn>}
          {p.archive && picked.some((a) => a.archived) && <Btn size="sm" disabled={none} onClick={() => run("restore")}>Restore</Btn>}
          {p.del && <Btn size="sm" variant="danger" disabled={none} onClick={() => open({ kind: "bulkDelete", ids, onDone: (keep) => s.set(keep) })}>Delete</Btn>}
          <Btn size="sm" variant="primary" onClick={s.stop}>Done</Btn>
        </div>
      </div>

      {panel && ids.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-divider pt-2.5">
          {panel === "status" && (
            <>
              <span className="text-[14px] text-mute-2">Mark {ids.length} as</span>
              {(["Draft", "Ready", "Live"] as const).filter((k) => k !== "Live" || p.publish).map((k) => (
                <button key={k} type="button" disabled={pending} onClick={() => run("status", { status: k })}
                  className="rounded-[7px] border border-line bg-white px-2.5 py-1 text-[14px] font-medium hover:border-mute-2 disabled:opacity-50">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: ASSET_STATUS[k] }} />{k}
                </button>
              ))}
              {!p.publish && <span className="text-[13.5px] text-mute-3">Marking Live needs a role that can publish.</span>}
            </>
          )}
          {panel === "due" && (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (date) void run("due", { date }); }}>
              <input type="date" aria-label="Due date for the selected assets" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-[7px] border border-line bg-white px-2 py-1 text-[14px]" />
              <Btn size="sm" type="submit" variant="primary" disabled={pending || !date}>Set date</Btn>
              <Btn size="sm" disabled={pending} onClick={() => run("due", { date: null })}>Clear dates</Btn>
            </form>
          )}
          {panel === "tag" && (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) void run("tag", { tag: tag.trim() }).then(() => setTag("")); }}>
              <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder="Tag" aria-label="Tag to add to the selected assets" className="field w-[180px] py-1 text-[14px]" />
              <Btn size="sm" type="submit" variant="primary" disabled={pending || !tag.trim()}>Add tag</Btn>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** The "Select" / "Done" switch that sits in a page header. */
export function SelectToggle({ s, className }: { s: Selection; className?: string }) {
  return (
    <Btn size="lg" aria-pressed={s.on} onClick={s.on ? s.stop : s.start} className={cx(s.on && "border-accent text-accent", className)}>
      {s.on ? "Done selecting" : "Select"}
    </Btn>
  );
}
