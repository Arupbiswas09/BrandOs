"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./provider";

/*
 * Real notifications, from the same data as the inbox:
 *   - a toast when something new lands on you while the app is open,
 *   - a desktop notification too, if you allowed them in Settings,
 *   - the count on the installed app's icon and in the tab title.
 * LiveSync refreshes the data every 30 seconds, so new work shows up
 * without a reload.
 */
export function Notifier() {
  const { ws, toast, setInbox } = useApp();
  const pathname = usePathname();
  const meId = ws.me.id;

  const items = useMemo(() => {
    const out = new Map<string, string>();
    for (const q of ws.queue()) if (q.who === meId) out.set(q.kind + q.id + q.verb, `${q.verb}: ${q.name}`);
    const unread = new Set(ws.d.unreadMentions);
    for (const c of ws.d.comments) {
      if (!unread.has(c.id)) continue;
      const where = c.kind === "asset" ? ws.asset(c.itemId)?.name : ws.offer(c.itemId)?.name;
      out.set("m" + c.id, `${ws.first(c.userId)} mentioned you on ${where ?? "a note"}`);
    }
    return out;
  }, [ws, meId]);
  const count = items.size;

  // Tell people about what is new since the last refresh, never about what was already there.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(items.keys()); return; }
    const fresh = [...items.entries()].filter(([k]) => !seen.current!.has(k));
    seen.current = new Set(items.keys());
    if (!fresh.length) return;
    toast(fresh.length === 1 ? fresh[0][1] : `${fresh.length} new things need you`);
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      try {
        const n = new Notification("BrandOS", { body: fresh.map(([, v]) => v).slice(0, 3).join("\n"), icon: "/icons/icon-192.png", tag: "brandos-inbox" });
        n.onclick = () => { window.focus(); setInbox(true); n.close(); };
      } catch {}
    }
  }, [items, toast, setInbox]);

  // App icon badge (installed app) and tab title.
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count) nav.setAppBadge?.(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
    const t = setTimeout(() => {
      const base = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = count ? `(${count}) ${base}` : base;
    }, 50);
    return () => clearTimeout(t);
  }, [count, pathname]);

  return null;
}
