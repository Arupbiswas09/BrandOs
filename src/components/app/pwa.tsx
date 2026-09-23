"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

/** Registers the service worker once, in production builds only. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };

/**
 * How this device can install the app: a native prompt (Chrome, Edge,
 * Android), manual steps (iPhone and iPad Safari), or already installed.
 */
export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => !!deferred, () => false);
  const standalone = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
  const ios = useSyncExternalStore(subscribe, () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1), () => false);
  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === "accepted";
  }, []);
  return { canPrompt, standalone, ios, install };
}

/** A thin bar while the browser reports no connection. */
export function OfflineBar() {
  const online = useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);
  if (online || dismissed) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[130] flex items-center justify-center gap-3 bg-ink px-4 py-2 text-[14.5px] text-white" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
      You are offline. Changes will not save until you reconnect.
      <button type="button" onClick={() => setDismissed(true)} className="text-white/70 hover:text-white" aria-label="Dismiss">✕</button>
    </div>
  );
}
