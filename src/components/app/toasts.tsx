"use client";

import { useApp } from "./provider";
import { cx } from "@/components/ui";

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[120] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cx(
            "pointer-events-auto max-w-[520px] animate-pop rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium shadow-[0_12px_32px_rgba(16,22,20,.18)]",
            t.tone === "error" ? "bg-[#7A3211] text-white" : "bg-ink text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
