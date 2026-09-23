"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * A preference kept in localStorage that every component reading the same
 * key sees at once. The server always renders the fallback.
 */

const EVENT = "bos:stored";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    const on = (e: Event) => { if (!(e instanceof CustomEvent) || e.detail === key) cb(); };
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", cb);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", cb); };
  }, [key]);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback((v: T) => {
    try { localStorage.setItem(key, v); } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  }, [key]);
  return [value, set];
}

const noop = () => () => {};

/** "Good morning" in the reader's own timezone, "Hello" on the server. */
export function useDayPart(): string {
  return useSyncExternalStore(
    noop,
    () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; },
    () => "Hello",
  );
}
