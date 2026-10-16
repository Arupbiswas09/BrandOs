"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useApp, type Toast } from "./provider";
import { IconBtn, cx } from "@/components/ui";

const TONE: Record<Toast["tone"], { icon: typeof Info; ink: string; label: string }> = {
  ok: { icon: CheckCircle2, ink: "text-ok", label: "Done" },
  error: { icon: AlertCircle, ink: "text-danger", label: "Problem" },
  info: { icon: Info, ink: "text-accent", label: "Note" },
};

/**
 * Toasts stack bottom-right (bottom-centre on phones, above the bottom bar).
 * Each one is a status or, for failures, an alert; the close button sits
 * beside the message so it is not read out as part of it.
 */
export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="bottom-mobile-nav pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end sm:px-0">
      {toasts.map((t) => {
        const tone = TONE[t.tone];
        const Icon = tone.icon;
        return (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-[420px] animate-toast items-start gap-3 rounded-xl border border-line bg-surface py-2.5 pl-3.5 pr-1.5 shadow-pop sm:w-[380px]">
            <div role={t.tone === "error" ? "alert" : "status"} className="flex min-w-0 flex-1 items-start gap-2.5 pt-0.5">
              <Icon aria-hidden className={cx("mt-px size-5 flex-none", tone.ink)} />
              <span className="sr-only">{tone.label}: </span>
              <span className="min-w-0 flex-1 text-body font-medium leading-[1.4] text-ink">{t.text}</span>
            </div>
            <IconBtn label="Dismiss notification" onClick={() => dismissToast(t.id)} className="focus-inset"><X aria-hidden /></IconBtn>
          </div>
        );
      })}
    </div>
  );
}
