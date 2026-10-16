"use client";

import { useCallback, useTransition } from "react";
import { useApp } from "@/components/app/provider";

/**
 * Runs one of the link actions with a pending flag, like useAction, but
 * keeps the action's own result type (a check, a run's counts). A refusal
 * becomes an error toast; the caller handles success.
 */
export function useRun() {
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const run = useCallback(<T extends { ok: true } | { ok: false; error: string }>(fn: () => Promise<T>): Promise<Extract<T, { ok: true }> | null> =>
    new Promise((resolve) => {
      start(async () => {
        try {
          const r = await fn();
          if (r.ok) return resolve(r as Extract<T, { ok: true }>);
          toast((r as { error: string }).error, "error");
        } catch {
          toast("Something went wrong. Try again.", "error");
        }
        resolve(null);
      });
    }), [toast]);
  return [run, pending] as const;
}
