"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./provider";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/** Global keys: ⌘K or / to search, N for new, ? for help, Esc closes the top layer. */
export function Shortcuts() {
  const { ws, modal, close, cmdk, setCmdk, inbox, setInbox, assetId, closeAsset, open, nav, setNav } = useApp();
  const router = useRouter();

  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdk(!cmdk);
        return;
      }
      if (e.key === "Escape") {
        if (modal) close();
        else if (cmdk) setCmdk(false);
        else if (inbox) setInbox(false);
        else if (nav) setNav(false);
        else if (assetId) closeAsset();
        return;
      }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || modal || cmdk) return;
      if (g) {
        g = false;
        const to = { s: "/", l: "/library", t: "/team" }[e.key.toLowerCase()];
        if (to) { e.preventDefault(); router.push(to); }
        return;
      }
      if (e.key === "/") { e.preventDefault(); setCmdk(true); }
      else if (e.key === "?") { e.preventDefault(); open({ kind: "shortcuts" }); }
      else if (e.key.toLowerCase() === "n" && ws.can("edit")) { e.preventDefault(); open({ kind: "new" }); }
      else if (e.key.toLowerCase() === "i") { e.preventDefault(); setInbox(true); }
      else if (e.key.toLowerCase() === "g") { g = true; clearTimeout(gTimer); gTimer = setTimeout(() => (g = false), 900); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(gTimer); };
  }, [ws, modal, close, cmdk, setCmdk, inbox, setInbox, assetId, closeAsset, open, nav, setNav, router]);

  return null;
}
