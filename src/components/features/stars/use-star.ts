"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { toggleStar } from "@/app/star-actions";
import { useApp } from "@/components/app/provider";
import type { Workspace } from "@/lib/types";
import { isStarred, starKey, type StarKind } from "@/lib/stars";

/*
 * Stars change on the click, before the server answers, and every star
 * button, the sidebar list and the dashboard card show the same thing. A
 * pending change lasts until the snapshot that includes it arrives; if the
 * server refuses, it is dropped (the star goes back) and the reason is shown.
 */

type Entry = { on: boolean; seq: number; settled: boolean; snap: Workspace | null };

let entries: ReadonlyMap<string, Entry> = new Map();
let seq = 0;
const listeners = new Set<() => void>();
const EMPTY: ReadonlyMap<string, Entry> = new Map();

function write(key: string, entry: Entry | null) {
  const next = new Map(entries);
  if (entry) next.set(key, entry); else next.delete(key);
  entries = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => entries;
const getServerSnapshot = () => EMPTY;

/** Stars being added (true) or taken away (false) that the snapshot does not show yet. */
export function usePendingStars(): ReadonlyMap<string, boolean> {
  const { ws } = useApp();
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    const m = new Map<string, boolean>();
    // Settled once the server said yes; from the next snapshot on, the snapshot itself is right.
    for (const [k, e] of all) if (!e.settled || e.snap === ws.d) m.set(k, e.on);
    return m;
  }, [all, ws.d]);
}

/** Whether this item is starred (counting a change in flight), and a function that flips it. */
export function useStar(kind: StarKind, id: string) {
  const { ws, toast } = useApp();
  const pending = usePendingStars();
  const key = starKey(kind, id);
  const on = pending.get(key) ?? isStarred(ws, kind, id);
  const snap = useRef(ws.d);
  useEffect(() => { snap.current = ws.d; });

  const set = useCallback(async (next: boolean) => {
    const mine = ++seq;
    write(key, { on: next, seq: mine, settled: false, snap: null });
    let r: Awaited<ReturnType<typeof toggleStar>>;
    try {
      r = await toggleStar(kind, id, next);
    } catch {
      r = { ok: false, error: "That did not save. Check your connection and try again." };
    }
    // A later click on the same item owns the entry now.
    if (entries.get(key)?.seq !== mine) return r;
    if (r.ok) write(key, { on: next, seq: mine, settled: true, snap: snap.current });
    else {
      write(key, null);
      toast(r.error, "error");
    }
    return r;
  }, [key, kind, id, toast]);

  const toggle = useCallback(() => set(!on), [set, on]);
  return { on, toggle, set };
}
