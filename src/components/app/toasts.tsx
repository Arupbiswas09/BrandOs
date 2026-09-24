"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useApp, type Toast } from "./provider";
import { cx } from "@/components/ui";

const TONE: Record<Toast["tone"], { icon: typeof Info; bar: string; ink: string; label: string }> = {
  ok: { icon: CheckCircle2, bar: "bg-[#16A34A]", ink: "text-[#15803D]", label: "Done" },
  error: { icon: AlertCircle, bar: "bg-[#DC2626]", ink: "text-[#B91C1C]", label: "Problem" },
  info: { icon: Info, bar: "bg-accent", ink: "text-accent", label: "Note" },
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
          <div key={t.id} className="pointer-events-auto relative flex w-full max-w-[420px] animate-toast items-start gap-3 overflow-hidden rounded-xl border border-line bg-white py-3 pl-4 pr-2 shadow-[0_14px_36px_rgba(15,23,42,.16)] sm:w-[380px]">
            <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1", tone.bar)} />
            <div role={t.tone === "error" ? "alert" : "status"} className="flex min-w-0 flex-1 items-start gap-2.5">
              <Icon className={cx("mt-px h-5 w-5 flex-none", tone.ink)} />
              <span className="sr-only">{tone.label}: </span>
              <span className="min-w-0 flex-1 text-[15px] font-medium leading-[1.4] text-ink">{t.text}</span>
            </div>
            <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="focus-inset -my-1 flex h-8 w-8 flex-none items-center justify-center rounded-md text-mute-3 transition-colors hover:bg-hover hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
