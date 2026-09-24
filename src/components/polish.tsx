"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { hexA, readable } from "@/lib/color";
import { cx } from "./ui";

/*
 * Small shared pieces for the entity pages (brand, offer, service, client):
 * one header pattern, icon tiles, tabs with icons and counts.
 */

/** The hover lift every clickable card shares. */
export const LIFT = "transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_24px_-12px_rgba(15,23,42,.18)] motion-reduce:hover:translate-y-0";

/** A visible focus ring for cards and tiles (the base outline would square their corners off). */
export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

/** A lucide icon on a soft tile. Takes the shell accent unless a colour is given. */
export function IconTile({ icon: Icon, color, size = 36, className }: { icon: LucideIcon; color?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("flex flex-none items-center justify-center rounded-[10px] theme-fade", !color && "bg-soft text-hl-ink", className)}
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
          "-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1.5 text-[14.5px] transition-colors",
          t.active ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-mute-3 hover:text-ink",
        );
        const body = (
          <>
            {Icon && <Icon aria-hidden size={16} strokeWidth={2} className={t.active ? "text-accent" : "text-mute-4"} />}
            {t.label}
            {t.count !== undefined && " "}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 py-px text-[12px] font-semibold tabular-nums leading-[1.5]", t.active ? "bg-accent text-on-accent" : "bg-chip text-mute-3")}>{t.count}</span>
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
 */
export function EntityHeader({ eyebrow, lead, title, sub, meta, actions, decor, children }: {
  eyebrow?: ReactNode; lead?: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode; actions?: ReactNode; decor?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className={cx("head-band -mt-8 mb-8 pt-7 sm:-mt-10 sm:pt-8", !children && "pb-7")}>
      {decor}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 basis-[320px] items-start gap-4">
          {lead}
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            <h1 className="m-0 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h1>
            {sub && <p className="m-0 mt-1 max-w-[70ch] text-[15px] text-mute-2 text-pretty">{sub}</p>}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** A quiet item in a header meta row: icon plus text. */
export function MetaItem({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[14px] text-mute-2", className)}>
      {Icon && <Icon aria-hidden size={15} strokeWidth={2} className="text-mute-4" />}
      {children}
    </span>
  );
}

/** A thin vertical rule between groups of header actions. */
export function ActionRule() {
  return <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />;
}

/** The empty state with a spot illustration above it. */
export function EmptyArt({ art, title, body, children, compact }: { art: ReactNode; title: string; body?: ReactNode; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center rounded-[14px] border border-dashed border-line-strong bg-white/60 text-center", compact ? "px-6 py-7" : "px-6 py-10 sm:py-12")}>
      <div className="mb-3">{art}</div>
      <div className="mb-1.5 text-[16px] font-semibold text-ink">{title}</div>
      {body && <div className="mx-auto mb-5 max-w-[46ch] text-[15px] leading-[1.55] text-mute-2 text-pretty">{body}</div>}
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
