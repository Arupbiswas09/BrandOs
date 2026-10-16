"use client";

import { Fragment, useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./ui";

/*
 * A page split into sections, one shown at a time (the Brand Kit, Settings).
 * Wide screens get a sticky rail on the left; narrower ones a sticky row of
 * tabs under the page header. It is the same tablist either way, restyled by
 * breakpoint, so arrow keys, focus and the panel's label never change.
 */

export type SectionItem<K extends string = string> = { key: K; label: string; group?: string };

type At = "lg" | "xl";

/* Every class written out in full for both breakpoints, so Tailwind can see them. */
const AT: Record<At, { query: string; band: string; grid: string; wrap: string; list: string; tab: string; on: string; off: string; group: string }> = {
  lg: {
    query: "(min-width: 64rem)",
    band: "lg:mb-8 lg:pb-7 lg:before:border-b lg:before:border-line",
    grid: "lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10",
    wrap: "lg:top-[calc(--spacing(23)+env(safe-area-inset-top))] lg:z-auto lg:mx-0 lg:mb-0 lg:self-start lg:px-0 lg:before:hidden",
    list: "lg:flex-col lg:gap-0.5 lg:overflow-visible",
    tab: "lg:mb-0 lg:w-full lg:rounded-lg lg:border-b-0 lg:px-3 lg:py-1.5 lg:text-left",
    on: "lg:bg-soft",
    off: "lg:hover:bg-hover",
    group: "lg:block",
  },
  xl: {
    query: "(min-width: 80rem)",
    band: "xl:mb-8 xl:pb-7 xl:before:border-b xl:before:border-line",
    grid: "xl:grid xl:grid-cols-[184px_minmax(0,1fr)] xl:items-start xl:gap-10",
    wrap: "xl:top-[calc(--spacing(23)+env(safe-area-inset-top))] xl:z-auto xl:mx-0 xl:mb-0 xl:self-start xl:px-0 xl:before:hidden",
    list: "xl:flex-col xl:gap-0.5 xl:overflow-visible",
    tab: "xl:mb-0 xl:w-full xl:rounded-lg xl:border-b-0 xl:px-3 xl:py-1.5 xl:text-left",
    on: "xl:bg-soft",
    off: "xl:hover:bg-hover",
    group: "xl:block",
  },
};

/** A white band that runs the full width of the content area (the page header look). */
const BLEED = "before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-[200vw] before:-translate-x-1/2 before:bg-surface";

function useWide(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The page header for a sectioned page. Below the breakpoint it runs straight
 * into the sticky tab row (one white band); from the breakpoint up it stands
 * alone with its own bottom edge.
 */
export function SectionsHead({ at, eyebrow, title, sub, meta, actions, flush = true }: {
  at: At; eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode; actions?: ReactNode;
  /** Pull up under the breadcrumb, as page headers do. Off when something sits above it. */
  flush?: boolean;
}) {
  return (
    <div className={cx("relative isolate pb-5", flush && "-mt-8 pt-8 sm:-mt-10 sm:pt-10", BLEED, AT[at].band)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-[280px]">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="display m-0 text-display text-ink">{title}</h1>
          {sub && <p className="mb-0 mt-2 max-w-[68ch] text-body text-mute-2 text-pretty">{sub}</p>}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * The section switcher and the one section on show. `idBase` keys the tab
 * and panel ids, so the panel is labelled by its tab.
 */
export function Sections<K extends string>({ at, items, active, onChange, label, idBase, children }: {
  at: At; items: SectionItem<K>[]; active: K; onChange: (k: K) => void; label: string; idBase: string; children: ReactNode;
}) {
  const v = AT[at];
  const wide = useWide(v.query);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const grid = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // In the row of tabs, keep the open one in view (a link can open a section that starts off to the side).
  useEffect(() => {
    const el = tabs.current[active];
    const row = list.current;
    if (!el || !row || row.scrollWidth <= row.clientWidth) return;
    const left = el.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left - 16;
  }, [active]);

  const pick = (k: K) => {
    if (k !== active) onChange(k);
    // A new section starts at its top: if the reader has scrolled into this one, bring the tabs back up under the header.
    const el = grid.current;
    if (!el) return;
    const header = 60 + (wide ? 32 : 0);
    const top = el.getBoundingClientRect().top + window.scrollY - header;
    if (window.scrollY > top) window.scrollTo({ top });
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    const n = items.length;
    const to = ({ ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = items[(to + n) % n];
    tabs.current[next.key]?.focus();
    pick(next.key);
  };

  return (
    <div ref={grid} className={v.grid}>
      <div className={cx("sticky top-[calc(--spacing(15)+env(safe-area-inset-top))] z-20 -mx-4 mb-6 px-4 sm:-mx-8 sm:px-8", BLEED, "before:border-b before:border-line", v.wrap)}>
        <div ref={list} role="tablist" aria-label={label} aria-orientation={wide ? "vertical" : "horizontal"} data-scroll
          className={cx("-mb-px flex gap-1 overflow-x-auto", v.list)}>
          {items.map((t, i) => {
            const on = t.key === active;
            const first = i === 0 || items[i - 1].group !== t.group;
            return (
              <Fragment key={t.key}>
                {t.group && first && (
                  <div aria-hidden className={cx("eyebrow hidden px-3 pb-1.5", i > 0 ? "pt-5" : "pt-0", v.group)}>{t.group}</div>
                )}
                <button
                  ref={(el) => { tabs.current[t.key] = el; }}
                  type="button" role="tab" id={`${idBase}-tab-${t.key}`} aria-selected={on} aria-controls={`${idBase}-panel`} tabIndex={on ? 0 : -1}
                  onClick={() => pick(t.key)} onKeyDown={(e) => onKey(e, i)}
                  className={cx(
                    "flex-none whitespace-nowrap border-b-2 px-3 pb-3 pt-3 text-body transition-colors duration-150",
                    on ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-mute-2 hover:text-ink",
                    v.tab, on ? v.on : v.off,
                  )}
                >
                  {t.label}
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${active}`} className="min-w-0">
        {children}
      </div>
    </div>
  );
}

/** The title row at the top of a section: a heading, one line on what it holds, and its own actions. */
export function SectionTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-[260px]">
        <h2 className="m-0 text-title font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        {sub && <p className="mb-0 mt-1 max-w-[68ch] text-body text-mute-2 text-pretty">{sub}</p>}
      </div>
      {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
