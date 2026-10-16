"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Ellipsis } from "lucide-react";
import { cx } from "@/components/ui";

export type CardMenuItem =
  | { kind: "item"; label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean }
  /** A labelled set of choices where one is current, such as which folder an asset sits in. */
  | { kind: "choice"; label: string; options: { label: string; checked: boolean; onSelect: () => void }[] };

const ITEM = "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14.5px] font-medium outline-none hover:bg-wash focus-visible:bg-wash";

/**
 * A small "…" menu for a card. It opens in a layer of its own (so a card's
 * hover lift or a narrow column never clips it), keeps inside the screen,
 * moves with the arrow keys and closes on Escape, a click elsewhere or a scroll.
 */
export function CardMenu({ label, items, triggerClassName, icon, onOpenChange }: {
  label: string;
  items: CardMenuItem[];
  triggerClassName?: string;
  icon?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const dismiss = useEffectEvent(() => setOpen(false));

  /** Under the button, right edges lined up, nudged back on screen; above it when there is no room below. */
  const place = useEffectEvent(() => {
    const m = menu.current, b = button.current?.getBoundingClientRect();
    if (!m || !b) return;
    const w = m.offsetWidth, h = m.offsetHeight;
    const below = b.bottom + 6;
    m.style.left = `${Math.min(Math.max(8, b.right - w), window.innerWidth - w - 8)}px`;
    m.style.top = `${below + h > window.innerHeight - 8 && b.top - h - 6 > 8 ? b.top - h - 6 : below}px`;
  });

  useLayoutEffect(() => {
    if (!open) return;
    place();
    menu.current?.querySelector<HTMLElement>("[role^=menuitem]")?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || button.current?.contains(t)) return;
      dismiss();
    };
    // It follows its button when the page scrolls or the window changes size.
    const follow = () => place();
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  if (!items.length) return null;

  const close = (refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); };
  const keys = (e: React.KeyboardEvent) => {
    // Keys stay in the menu, so Escape closes this and not the drawer or page behind it.
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key === "Tab") { close(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const all = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? []);
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length;
    all[next]?.focus();
  };
  // Focus goes back to the button first, so whatever opens next (a picker, a form) returns there too.
  const pick = (fn: () => void) => { close(true); fn(); };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={triggerClassName}
      >
        {icon ?? <Ellipsis aria-hidden size={16} />}
      </button>
      {open && createPortal(
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={keys}
          className="fixed z-[75] min-w-[210px] max-w-[min(280px,calc(100vw-16px))] animate-pop overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_12px_32px_rgba(16,22,20,.14)]"
          style={{ top: -9999, left: -9999 }}
        >
          {items.map((it, i) => it.kind === "item" ? (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1} onClick={() => pick(it.onSelect)} className={cx(ITEM, it.danger ? "text-danger" : "text-ink-3")}>
              {it.icon}<span className="min-w-0 flex-1">{it.label}</span>
            </button>
          ) : (
            <div key={it.label} role="group" aria-label={it.label} className={cx(i > 0 && "mt-1 border-t border-divider pt-1")}>
              <div aria-hidden className="eyebrow px-3.5 pb-1 pt-1.5 text-[11px]">{it.label}</div>
              {it.options.map((o) => (
                <button key={o.label} type="button" role="menuitemradio" aria-checked={o.checked} tabIndex={-1} onClick={() => pick(o.onSelect)} className={cx(ITEM, "text-ink-3")}>
                  <span className="flex w-4 flex-none justify-center text-accent">{o.checked && <Check aria-hidden size={15} />}</span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
