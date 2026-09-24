"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
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
      <div className="fixed inset-0 animate-fade bg-[rgba(15,23,42,.38)] backdrop-blur-[2px]" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        className="group/dlg relative w-full animate-pop overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_64px_rgba(15,23,42,.22)]"
        style={{ maxWidth: width }}
      >
        <Inner
          {...(onSubmit ? { onSubmit: (e: React.FormEvent) => { e.preventDefault(); onSubmit(); } } : {})}
        >
          <div className={cx("relative py-5 pl-6 pr-14 sm:pl-7", (children || footer) ? "border-b border-line" : "")}>
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            <div className="text-[20px] font-semibold leading-[1.3] tracking-[-0.015em]">{title}</div>
            {sub && <div className="mt-1 text-[15px] leading-[1.5] text-mute-2 text-pretty">{sub}</div>}
            <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-mute-3 transition-colors hover:bg-hover hover:text-ink">
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
          {children && <div className={cx("flex flex-col gap-4 px-6 pb-6 pt-[22px] sm:px-7", bodyClass)}>{children}</div>}
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-[9px] border-t border-line bg-wash-2 px-6 py-3.5 sm:px-7">
              <span className="mr-auto hidden text-[13px] text-mute-3 group-has-[[required]]/dlg:inline"><span aria-hidden className="text-[#DC2626]">*</span> Required</span>
              {footer}
            </div>
          )}
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
      <Btn type="submit" variant="primary" disabled={pending || disabled} title={disabled && !pending ? "Fill in the fields marked *" : undefined} className={cx("px-[17px] py-2", solid && `${solid} text-white`)}>
        {pending ? "Saving…" : saveLabel}
      </Btn>
    </>
  );
}
