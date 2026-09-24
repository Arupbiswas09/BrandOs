"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Workspace } from "@/lib/types";
import { WS } from "@/lib/ws";
import type { Result } from "@/app/actions";
import type { ModalSpec } from "@/components/modals/types";

export type Toast = { id: number; text: string; tone: "ok" | "error" | "info" };

type Ctx = {
  ws: WS;
  modal: ModalSpec | null;
  open: (m: ModalSpec) => void;
  close: () => void;
  cmdk: boolean;
  setCmdk: (v: boolean) => void;
  inbox: boolean;
  setInbox: (v: boolean) => void;
  nav: boolean;
  setNav: (v: boolean) => void;
  assetId: string | null;
  openAsset: (id: string, tab?: string) => void;
  closeAsset: () => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  nudge: { assetId: string; offerId: string } | null;
  setNudge: (n: { assetId: string; offerId: string } | null) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({ data, children }: { data: Workspace; children: ReactNode }) {
  const ws = useMemo(() => new WS(data), [data]);
  const params = useSearchParams();
  const [modal, setModal] = useState<ModalSpec | null>(null);
  const [cmdk, setCmdk] = useState(false);
  const [inbox, setInbox] = useState(() => params.get("inbox") === "1");
  const [nav, setNav] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nudge, setNudge] = useState<Ctx["nudge"]>(null);
  const seq = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const assetId = params.get("asset");
  // The mobile navigation closes whenever the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); if (nav) setNav(false); }

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const withParam = useCallback((key: string, value: string | null, extra?: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key); else next.set(key, value);
    for (const [k, v] of Object.entries(extra ?? {})) { if (v === null) next.delete(k); else next.set(k, v); }
    const q = next.toString();
    return pathname + (q ? `?${q}` : "");
  }, [params, pathname]);

  const openAsset = useCallback((id: string, tab?: string) => {
    setModal(null); setCmdk(false); setInbox(false); setNav(false);
    router.push(withParam("asset", id, { tab: tab ?? null }), { scroll: false });
  }, [router, withParam]);
  const closeAsset = useCallback(() => router.push(withParam("asset", null, { tab: null }), { scroll: false }), [router, withParam]);

  const value: Ctx = {
    ws, modal, open: (m) => { setCmdk(false); setModal(m); }, close: () => setModal(null),
    cmdk, setCmdk, inbox, setInbox, nav, setNav, assetId, openAsset, closeAsset, toast, toasts, dismissToast, nudge, setNudge,
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useApp() {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error("useApp must be used inside WorkspaceProvider");
  return c;
}

export function useWS() {
  return useApp().ws;
}

/**
 * Runs a server action, keeps a pending flag, and turns a failed Result into
 * a toast. Resolves with the Result so callers can navigate on success.
 */
export function useAction() {
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const run = useCallback(
    <A extends unknown[]>(fn: (...a: A) => Promise<Result | void>, ...args: A): Promise<Result> =>
      new Promise((resolve) => {
        start(async () => {
          try {
            const r = (await fn(...args)) ?? { ok: true as const };
            if (!r.ok) toast(r.error, "error");
            resolve(r);
          } catch (e) {
            // redirect() inside an action surfaces here as a navigation, which is fine.
            if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
            toast("Something went wrong. Try again.", "error");
            resolve({ ok: false, error: "failed" });
          }
        });
      }),
    [toast],
  );
  return [run, pending] as const;
}
