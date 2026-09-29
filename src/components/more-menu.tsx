"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cx } from "@/components/ui";

export type MoreItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean };

/**
 * A "…" button with a short menu, for actions that should not sit next to
 * the everyday ones (archiving or deleting a whole client, for example).
 */
export function MoreMenu({ items, label = "More actions" }: { items: MoreItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!items.length) return null;
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = Array.from(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[8px] border border-line bg-white text-mute-2 transition hover:border-line-strong hover:text-ink">
        <MoreHorizontal aria-hidden className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div role="menu" aria-label={label} onKeyDown={move} className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[200px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,.14)]">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}
              className={cx("flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14.5px] font-medium outline-none hover:bg-wash focus-visible:bg-wash", it.danger ? "text-danger" : "text-ink-3")}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
