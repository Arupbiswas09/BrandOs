"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const EVERY = 30_000;

/**
 * Keeps the workspace current without a reload: refreshes when you come
 * back to the tab and every 30 seconds while it is visible. What you are
 * typing is kept; only the data underneath updates.
 */
export function LiveSync() {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() - last.current < 5_000) return;
      last.current = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, EVERY);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router]);
  return null;
}
