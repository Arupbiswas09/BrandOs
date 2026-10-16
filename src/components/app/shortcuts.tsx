"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./provider";
import { useNavMode } from "./nav-mode";
import { NEW_MENU_EVENT } from "./new-menu";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/**
 * Global keys: ⌘K or / to search, N for new, ? for help, Esc closes the top layer.
 * S (star this page) belongs to the page it stars: see useStarShortcut.
 */
export function Shortcuts() {
  const [navMode, setNavMode] = useNavMode();
  const { modal, close, cmdk, setCmdk, inbox, setInbox, assetId, closeAsset, open, nav, setNav } = useApp();
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
        const to = ({ s: "/", l: "/library", t: "/team", p: "/settings", c: "/calendar" } as Record<string, string>)[e.key.toLowerCase()];
        if (to) { e.preventDefault(); router.push(to); }
        return;
      }
      if (e.key === "/") { e.preventDefault(); setCmdk(true); }
      else if (e.key === "?") { e.preventDefault(); open({ kind: "shortcuts" }); }
      // The New menu knows what this person may create (and is not there when that is nothing).
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); window.dispatchEvent(new CustomEvent(NEW_MENU_EVENT)); }
      else if (e.key.toLowerCase() === "i") { e.preventDefault(); setInbox(true); }
      else if (e.key === "[") { e.preventDefault(); setNavMode(navMode === "mini" ? "full" : "mini"); }
      else if (e.key.toLowerCase() === "g") { g = true; clearTimeout(gTimer); gTimer = setTimeout(() => (g = false), 900); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(gTimer); };
  }, [modal, close, cmdk, setCmdk, inbox, setInbox, assetId, closeAsset, open, nav, setNav, router, navMode, setNavMode]);

  return null;
}
