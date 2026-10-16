"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/app/provider";
import type { StarKind } from "@/lib/stars";
import { useStar } from "./use-star";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/** How long after "g" an "s" still means "go to the Street" (the global shortcut), not "star". */
const G_WINDOW = 900;

/**
 * "s" stars or unstars the item whose page this is. Not wired globally: call
 * it from the item's own page (or the asset drawer) and the key works there.
 * It stays quiet while typing, while a dialog, search or the inbox is open,
 * after "g" (so "g s" still goes to the Street), and on a page while the
 * asset drawer is open on top of it.
 */
export function useStarShortcut(kind: StarKind, id: string, name: string, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const { modal, cmdk, inbox, assetId, toast } = useApp();
  const { on, set } = useStar(kind, id);
  const lastG = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "g") { lastG.current = Date.now(); return; }
      if (k !== "s" || e.repeat || e.defaultPrevented) return;
      if (Date.now() - lastG.current < G_WINDOW) return;
      if (modal || cmdk || inbox) return;
      // The drawer sits on top of the page it was opened from: "s" belongs to whichever is in front.
      if (kind === "asset" ? assetId !== id : !!assetId) return;
      e.preventDefault();
      // The button may be out of view, so the change is said out loud too.
      toast(on ? `Unstarred ${name}` : `Starred ${name}`, "info");
      void set(!on);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, modal, cmdk, inbox, assetId, kind, id, name, on, set, toast]);
}
