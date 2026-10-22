"use client";

import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useApp, type Toast } from "./provider";
import { Btn, IconBtn, cx } from "@/components/ui";

const TONE: Record<Toast["tone"], { icon: typeof Info; ink: string; label: string; stay: number }> = {
  ok: { icon: CheckCircle2, ink: "text-ok", label: "Done", stay: 3200 },
  error: { icon: AlertCircle, ink: "text-danger", label: "Problem", stay: 6000 },
  info: { icon: Info, ink: "text-accent", label: "Note", stay: 3200 },
};
/** A toast that offers something to do (Undo, say) stays longer, so there is time to reach it. */
const STAY_WITH_ACTION = 8000;
/** Once the pointer or focus leaves a held toast, it stays at least this long before going. */
const STAY_AFTER_HOLD = 2000;

/**
 * Toasts stack bottom-right (bottom-centre on phones, above the bottom bar).
 * Each one is a status or, for failures, an alert; its action and the close
 * button sit beside the message so they are not read out as part of it.
 */
export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="bottom-mobile-nav pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end sm:px-0">
      {toasts.map((t) => <ToastCard key={t.id} t={t} onDismiss={dismissToast} />)}
    </div>
  );
}

function ToastCard({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  const tone = TONE[t.tone];
  const Icon = tone.icon;
  const msg = useId();
  const action = t.action;
  // While the pointer is over a toast with an action, or focus is inside it, it waits.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = !!action && (hovered || focused);
  const left = useRef(action ? Math.max(STAY_WITH_ACTION, tone.stay) : tone.stay);
  const { id } = t;
  useEffect(() => {
    if (held) return;
    const since = Date.now();
    const timer = setTimeout(() => onDismiss(id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(STAY_AFTER_HOLD, left.current - (Date.now() - since));
    };
  }, [held, id, onDismiss]);
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      className="pointer-events-auto flex w-full max-w-[420px] animate-toast items-start gap-3 rounded-xl border border-line bg-surface py-2.5 pl-3.5 pr-1.5 shadow-pop sm:w-[380px]"
      {...(action && { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), onFocus: () => setFocused(true), onBlur })}
    >
      <div role={t.tone === "error" ? "alert" : "status"} className="flex min-w-0 flex-1 items-start gap-2.5 pt-0.5">
        <Icon aria-hidden className={cx("mt-px size-5 flex-none", tone.ink)} />
        <span className="sr-only">{tone.label}: </span>
        <span id={msg} className="min-w-0 flex-1 text-body font-medium leading-[1.4] text-ink">{t.text}</span>
      </div>
      {action && (
        <Btn
          size="sm"
          aria-describedby={msg}
          className="-my-1 self-center"
          onClick={() => {
            try { action.onClick(); } finally { onDismiss(id); }
          }}
        >
          {action.label}
        </Btn>
      )}
      <IconBtn label="Dismiss notification" onClick={() => onDismiss(id)} className={cx("focus-inset", action && "self-center")}><X aria-hidden /></IconBtn>
    </div>
  );
}
