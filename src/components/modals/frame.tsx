"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { useApp } from "@/components/app/provider";
import { Btn, IconBtn, cx } from "@/components/ui";

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
    // The dialog never runs off the screen: its title and its footer (Save) stay put and only the middle scrolls.
    <div onKeyDown={onClose ? (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } } : undefined} className="fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:px-6 sm:pt-[7vh]">
      <div className="fixed inset-0 animate-fade bg-[rgba(16,22,20,.38)]" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        className="group/dlg relative flex max-h-[calc(100dvh-12px)] w-full animate-pop flex-col overflow-hidden rounded-t-xl border border-line bg-surface shadow-pop sm:max-h-[86vh] sm:rounded-xl"
        style={{ maxWidth: width }}
      >
        <Inner
          className="flex min-h-0 flex-1 flex-col"
          {...(onSubmit ? { onSubmit: (e: React.FormEvent) => { e.preventDefault(); onSubmit(); } } : {})}
        >
          <div className={cx("relative flex-none py-5 pl-6 pr-14 sm:pl-7", (children || footer) ? "border-b border-line" : "")}>
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            <div className="text-title font-semibold leading-[1.3] tracking-[-0.015em]">{title}</div>
            {sub && <div className="mt-1 text-body leading-[1.5] text-mute-2 text-pretty">{sub}</div>}
            <IconBtn label="Close" onClick={close} className="absolute right-3 top-3">
              <X aria-hidden />
            </IconBtn>
          </div>
          {children && <div data-scroll className={cx("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5 sm:px-7", bodyClass)}>{children}</div>}
          {footer && (
            <div className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-line bg-wash-2 px-6 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-7">
              <span className="mr-auto hidden text-small text-mute-3 sm:group-has-[[required]]/dlg:inline"><span aria-hidden>*</span> Required</span>
              {footer}
            </div>
          )}
        </Inner>
      </div>
    </div>
  );
}

/**
 * The optional half of a form, closed until asked for. Closed, it says what
 * is behind it (`hint`) or how much of it is already filled in, so nothing
 * typed earlier is ever out of sight without a word. Forms open it straight
 * away when editing something that has any of it filled.
 */
export function MoreDetail({ open, onToggle, filled, hint, children }: {
  open: boolean; onToggle: () => void; filled: number; hint: string; children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="border-t border-line">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="group flex w-full items-center gap-2.5 rounded-lg py-3 text-left">
        <ChevronRight aria-hidden size={16} className={cx("flex-none text-mute-3 transition-transform duration-200 ease-snap", open && "rotate-90")} />
        <span className="min-w-0 flex-1 text-body">
          <span className="font-semibold text-ink group-hover:underline">More detail</span>
          {!open && <span className="text-mute-2"> · {filled ? `${filled} filled` : hint}</span>}
        </span>
        <span className="flex-none text-small text-mute-3">Optional</span>
      </button>
      <div id={id} inert={!open} className={cx("grid transition-[grid-template-rows,opacity] duration-200 ease-snap", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        {/* The side padding keeps focus rings clear of the clipping edge. */}
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div className="flex flex-col gap-4 pb-1 pt-1.5">{children}</div>
        </div>
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
      <Btn onClick={onCancel ?? close}>Cancel</Btn>
      <Btn type="submit" variant="primary" disabled={pending || disabled} title={disabled && !pending ? "Fill in the fields marked *" : undefined} className={cx(solid && `${solid} text-white`)}>
        {pending ? "Saving…" : saveLabel}
      </Btn>
    </>
  );
}
