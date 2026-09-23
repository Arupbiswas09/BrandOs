"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";

/** The shared dialog: dimmed backdrop, card, header, scrolling body, footer. */
export function Modal({
  title, sub, eyebrow, width = 520, children, footer, bodyClass, onSubmit, label, onClose,
}: {
  title: ReactNode;
  sub?: ReactNode;
  eyebrow?: ReactNode;
  width?: number;
  children?: ReactNode;
  footer?: ReactNode;
  bodyClass?: string;
  onSubmit?: () => void;
  label?: string;
  /** For dialogs that live outside the app's modal slot. */
  onClose?: () => void;
}) {
  const app = useApp();
  const close = onClose ?? app.close;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([disabled]), textarea, select");
    first?.focus();
    const prev = document.activeElement as HTMLElement | null;
    // Keep Tab inside the dialog.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex='-1'])")).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const a = nodes[0], z = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    el.addEventListener("keydown", trap);
    return () => { el.removeEventListener("keydown", trap); prev?.focus?.(); };
  }, []);

  const Inner = onSubmit ? "form" : "div";
  return (
    <div onKeyDown={onClose ? (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } } : undefined} className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto px-3 pb-10 pt-10 sm:px-6 sm:pt-[72px]">
      <div className="fixed inset-0 animate-fade bg-[rgba(16,22,20,.34)]" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        className="relative w-full animate-pop overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(16,22,20,.22)]"
        style={{ maxWidth: width }}
      >
        <Inner
          {...(onSubmit ? { onSubmit: (e: React.FormEvent) => { e.preventDefault(); onSubmit(); } } : {})}
        >
          <div className={cx("px-6 pb-4 pt-6 sm:px-7", (children || footer) ? "border-b border-line" : "")}>
            {eyebrow && <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.08em] text-mute-4">{eyebrow}</div>}
            <div className="text-[19px] font-semibold tracking-[-0.015em]">{title}</div>
            {sub && <div className="mt-1 text-[12.5px] leading-[1.5] text-mute-2">{sub}</div>}
          </div>
          {children && <div className={cx("flex flex-col gap-4 px-6 pb-6 pt-[22px] sm:px-7", bodyClass)}>{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-[9px] border-t border-line bg-wash-2 px-6 py-3.5 sm:px-7">{footer}</div>}
        </Inner>
      </div>
    </div>
  );
}

export function Footer({ saveLabel, pending, disabled, onCancel, left, saveVariant = "primary" }: {
  saveLabel: string; pending?: boolean; disabled?: boolean; onCancel?: () => void; left?: ReactNode; saveVariant?: "primary" | "danger-solid" | "change-solid";
}) {
  const { close } = useApp();
  const solid = saveVariant === "danger-solid" ? "bg-danger" : saveVariant === "change-solid" ? "bg-change" : "";
  return (
    <>
      {left}
      {left && <span className="flex-1" />}
      <Btn size="md" onClick={onCancel ?? close} className="px-[15px] py-2">Cancel</Btn>
      <Btn type="submit" variant="primary" disabled={pending || disabled} className={cx("px-[17px] py-2", solid && `${solid} text-white`)}>
        {pending ? "Saving…" : saveLabel}
      </Btn>
    </>
  );
}
