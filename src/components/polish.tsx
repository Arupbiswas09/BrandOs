"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { hexA, readable } from "@/lib/color";
import { cx } from "./ui";

/*
 * Small shared pieces for the entity pages (brand, offer, service, client):
 * one header pattern, icon tiles, tabs with icons and counts.
 */

/** The hover lift every clickable card shares. */
export const LIFT = "transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card motion-reduce:hover:translate-y-0";

/** A visible focus ring for cards and tiles (the base outline would square their corners off). */
export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

/** A lucide icon on a soft tile. Takes the shell accent unless a colour is given. */
export function IconTile({ icon: Icon, color, size = 36, className }: { icon: LucideIcon; color?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("flex flex-none items-center justify-center rounded-xl theme-fade", !color && "bg-soft text-hl-ink", className)}
      style={{ width: size, height: size, ...(color && { background: hexA(color, 0.12), color: readable(color, 0.12) }) }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

/** Underline tabs with an icon and an optional count. Same roles as the plain tabs. */
export function IconTabs({ items, className, label }: {
  items: { key: string; label: string; icon?: LucideIcon; count?: number; href?: string; active: boolean; onClick?: () => void }[];
  className?: string;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx("flex flex-none gap-1 overflow-x-auto", className)}>
      {items.map((t) => {
        const Icon = t.icon;
        const cls = cx(
          "-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1.5 text-body transition-colors",
          t.active ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-mute-3 hover:text-ink",
        );
        const body = (
          <>
            {Icon && <Icon aria-hidden size={16} strokeWidth={2} className={t.active ? "text-accent" : "text-mute-4"} />}
            {t.label}
            {t.count !== undefined && " "}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 py-px text-micro font-semibold tabular-nums leading-[1.5]", t.active ? "bg-accent text-on-accent" : "bg-chip text-mute-3")}>{t.count}</span>
            )}
          </>
        );
        return t.href ? (
          <Link key={t.key} href={t.href} role="tab" aria-selected={t.active} className={cls} scroll={false}>{body}</Link>
        ) : (
          <button key={t.key} type="button" role="tab" aria-selected={t.active} className={cls} onClick={t.onClick}>{body}</button>
        );
      })}
    </div>
  );
}

/**
 * The white header band shared by offer, service and client pages:
 * an eyebrow, a lead tile, the title, a meta row, and actions on the right.
 * On phones the actions drop under the title and wrap, so none is ever cut off.
 */
export function EntityHeader({ eyebrow, lead, title, sub, meta, actions, decor, children }: {
  eyebrow?: ReactNode; lead?: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode; actions?: ReactNode; decor?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className={cx("head-band -mt-8 mb-8 pt-7 sm:-mt-10 sm:pt-8", !children && "pb-7")}>
      {decor}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {lead}
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            <h1 className="display m-0 text-display text-ink [overflow-wrap:anywhere]">{title}</h1>
            {sub && <p className="m-0 mt-1 max-w-[70ch] text-body text-mute-2 text-pretty">{sub}</p>}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:max-w-[60%] sm:flex-none sm:justify-end">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Tabs that switch panels in place: underline style, one tab stop, arrow keys
 * (and Home, End) move between them. Pair each panel with `tabPanel(id, key)`.
 */
export function PanelTabs<K extends string>({ id, items, value, onChange, label, className }: {
  id: string;
  items: { key: K; label: string; count?: number | string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === value);
    const n = e.key === "ArrowRight" ? (i + 1) % items.length
      : e.key === "ArrowLeft" ? (i - 1 + items.length) % items.length
      : e.key === "Home" ? 0
      : e.key === "End" ? items.length - 1
      : -1;
    if (n < 0) return;
    e.preventDefault();
    onChange(items[n].key);
    refs.current.get(items[n].key)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={keys} className={cx("flex gap-1 overflow-x-auto", className)}>
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => { if (el) refs.current.set(t.key, el); else refs.current.delete(t.key); }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.key}`}
            aria-controls={`${id}-panel-${t.key}`}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cx(
              "-mb-px inline-flex h-10 flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-body font-medium transition-colors duration-150",
              on ? "border-accent text-ink" : "border-transparent text-mute-2 hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="text-meta tabular-nums text-mute-2">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The props for the panel that goes with a `PanelTabs` tab. */
export const tabPanel = (id: string, key: string) => ({
  role: "tabpanel" as const,
  id: `${id}-panel-${key}`,
  "aria-labelledby": `${id}-tab-${key}`,
});

/** A quiet item in a header meta row: icon plus text. */
export function MetaItem({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-meta text-mute-2", className)}>
      {Icon && <Icon aria-hidden size={15} strokeWidth={2} className="text-mute-4" />}
      {children}
    </span>
  );
}

/** A thin vertical rule between groups of header actions. */
export function ActionRule() {
  return <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />;
}
