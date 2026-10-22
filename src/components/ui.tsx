"use client";

import Link from "next/link";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { hexA, onColor, readable } from "@/lib/color";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** The type scale in px (globals.css): text inside tiles and avatars snaps to it, ties going down. */
const SCALE = [12, 13, 14, 16, 18, 20, 26, 32];
export function onScale(px: number) {
  return SCALE.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), SCALE[0]);
}

/** The one pill shape for small labels: status words, roles, counts in words. Chip adds a colour. */
const PILL_SHAPE = "inline-flex flex-none items-center whitespace-nowrap rounded-full font-medium leading-none";
export const PILL = `${PILL_SHAPE} h-[22px] px-2.5 text-small`;

/* ---------------------------------------------------------------- type */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("eyebrow", className)}>{children}</div>;
}

/** The white header band at the top of a page. `tabs` sit flush on its bottom edge. */
export function PageHead({
  eyebrow, title, sub, actions, children, tabs,
}: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; tabs?: ReactNode }) {
  return (
    <div className={cx("head-band -mt-8 mb-7 pt-8 sm:-mt-10 sm:pt-10", tabs ? "pb-0" : "pb-6")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
          <h1 className="display m-0 text-display text-ink">{title}</h1>
          {sub && <p className="mb-0 mt-2 max-w-[68ch] text-body text-mute-2 text-pretty">{sub}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
      {tabs}
    </div>
  );
}

/** A section title inside the content area (under a header band that already exists). */
export function SectionHead({ eyebrow, title, sub, actions, icon, as: H = "h2" }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; icon?: ReactNode; /** "h1" when this is the page's title. */ as?: "h1" | "h2" }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
        <H className="display m-0 flex items-center gap-2.5 text-display text-ink">{icon && <IconTile>{icon}</IconTile>}{title}</H>
        {sub && <p className="mb-0 mt-1.5 max-w-[68ch] text-body text-mute-2 text-pretty">{sub}</p>}
      </div>
      {actions && <div className="flex flex-none flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * One row of filters: a search box and compact dropdowns, never several rows of
 * chips. Each dropdown only appears when it offers a real choice (two or more
 * options besides "All").
 */
export function FilterBar({ q, onQ, placeholder, selects, onClear, className }: {
  q?: string; onQ?: (v: string) => void; placeholder?: string;
  selects: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }[];
  onClear?: () => void; className?: string;
}) {
  const shown = selects.filter((x) => x.options.length > 2);
  const active = !!q || shown.some((x) => x.value !== x.options[0]?.value);
  if (!onQ && !shown.length) return null;
  return (
    <div role="search" className={cx("mb-6 flex flex-wrap items-center gap-2", className)}>
      {onQ && <input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="field w-full max-w-[280px] py-2 text-body sm:w-[280px]" />}
      {shown.map((x) => (
        <Select key={x.label} aria-label={x.label} value={x.value} onChange={x.onChange} options={x.options}
          className={cx("w-auto py-2 pr-8 text-body", x.value !== x.options[0]?.value && "border-accent font-semibold text-accent")} />
      ))}
      {active && onClear && <Btn size="sm" onClick={onClear}>Clear</Btn>}
    </div>
  );
}

/** How wide the fade is at an edge with more tabs behind it, and how far clear of it the selected tab is kept. */
const TAB_FADE = 40;

/** Which edges of a sideways scroller have more behind them. */
type More = "start" | "end" | "both" | undefined;

function moreOf(el: HTMLElement): More {
  const start = el.scrollLeft > 1;
  const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  return start && end ? "both" : start ? "start" : end ? "end" : undefined;
}

/** The fade fades the tabs themselves, so it suits any background behind them (white, a brand tint, a dialog). */
const MASK: Record<Exclude<More, undefined>, string> = {
  start: `linear-gradient(to right, transparent, #000 ${TAB_FADE}px)`,
  end: `linear-gradient(to right, #000 calc(100% - ${TAB_FADE}px), transparent)`,
  both: `linear-gradient(to right, transparent, #000 ${TAB_FADE}px, #000 calc(100% - ${TAB_FADE}px), transparent)`,
};

/** Scrolls `tab` sideways into `box`, clear of the fades, without moving the page. */
function reveal(box: HTMLElement, tab: HTMLElement, smooth: boolean) {
  const b = box.getBoundingClientRect();
  const r = tab.getBoundingClientRect();
  const start = r.left - b.left + box.scrollLeft;
  const end = start + r.width;
  let to = box.scrollLeft;
  if (start - TAB_FADE < to) to = start - TAB_FADE;
  else if (end + TAB_FADE > to + box.clientWidth) to = end + TAB_FADE - box.clientWidth;
  to = Math.max(0, Math.min(to, box.scrollWidth - box.clientWidth));
  if (Math.abs(to - box.scrollLeft) < 1) return;
  const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  box.scrollTo({ left: to, behavior: smooth && !still ? "smooth" : "auto" });
}

/**
 * Underline tabs, as in the kit's page headers. When they do not fit (six
 * tabs on a phone) they scroll sideways: the edge with more behind it fades
 * out, and the selected tab is always scrolled into view.
 */
export function Tabs({ items, className }: { items: { key: string; label: ReactNode; href?: string; active: boolean; onClick?: () => void }[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<More>();
  const keys = items.map((t) => t.key).join("\u0001");
  const selected = items.find((t) => t.active)?.key;
  const seen = useRef(false);

  // Which edges fade: on scroll, and whenever the box or a tab changes size (a phone turning, fonts arriving).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setMore(moreOf(el));
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (ro) { ro.observe(el); Array.from(el.children).forEach((c) => ro.observe(c)); }
    return () => { el.removeEventListener("scroll", update); ro?.disconnect(); };
  }, [keys]);

  // The selected tab is never left off the edge: straight away on arrival, smoothly after that.
  useEffect(() => {
    const el = box.current;
    const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (el && tab) reveal(el, tab, seen.current);
    seen.current = true;
  }, [selected, keys]);

  const mask = more ? MASK[more] : undefined;
  return (
    // The default gap above gives way to a caller's own (the kit dialog's sticky tabs ask for mt-0).
    <div className={cx(!/(^|\s)mt-/.test(className ?? "") && "mt-5", "flex-none", className)}>
      <div ref={box} role="tablist" data-more={more} className="flex gap-1 overflow-x-auto" style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        // A tab reached with the keyboard comes out from under the fade too.
        onFocus={(e) => { if (box.current && e.target !== box.current) reveal(box.current, e.target as HTMLElement, true); }}>
        {items.map((t) => {
          const cls = cx("focus-inset -mb-px flex-none whitespace-nowrap rounded-t-md border-b-2 px-3 pb-3 pt-1.5 text-body font-medium transition-colors duration-150", t.active ? "border-accent text-ink" : "border-transparent text-mute-3 hover:border-line-strong hover:text-ink");
          return t.href ? (
            <Link key={t.key} href={t.href} role="tab" aria-selected={t.active} className={cls} scroll={false}>{t.label}</Link>
          ) : (
            <button key={t.key} type="button" role="tab" aria-selected={t.active} className={cls} onClick={t.onClick}>{t.label}</button>
          );
        })}
      </div>
    </div>
  );
}

/** The small tinted square that holds a section icon. */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return <span aria-hidden className={cx("flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-soft text-accent theme-fade [&>svg]:h-4 [&>svg]:w-4", className)}>{children}</span>;
}

export function H2({ children, className, right, icon }: { children: ReactNode; className?: string; right?: ReactNode; icon?: ReactNode }) {
  const h = <h2 className={cx("m-0 text-lead font-semibold tracking-[-0.01em]", !!icon && "flex items-center gap-2.5", !right && !/(^|\s)mb-/.test(className ?? "") && "mb-3.5", !right && className)}>{icon && <IconTile>{icon}</IconTile>}{children}</h2>;
  if (!right) return h;
  return (
    <div className={cx(!/(^|\s)mb-/.test(className ?? "") && "mb-3.5", "flex items-center justify-between gap-4", className)}>
      {h}
      {right}
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto max-w-[1180px] px-4 pb-12 pt-8 sm:px-8 sm:pt-10 lg:pb-22", className)}>{children}</div>;
}

/* ---------------------------------------------------------------- buttons */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "approve" | "change" | "link" | "outline-accent";
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" };

const variants: Record<BtnVariant, string> = {
  primary: "border border-transparent bg-accent text-on-accent font-semibold hover:brightness-110 theme-fade",
  secondary: "border border-line bg-surface text-ink-3 font-medium hover:bg-wash hover:border-line-strong",
  ghost: "border border-transparent bg-transparent text-mute-2 hover:text-ink",
  danger: "border border-line bg-surface text-danger font-medium hover:border-[#C99A8E]",
  // Kept as a name for older call sites; one accent only, so it is the primary look.
  dark: "border border-transparent bg-accent text-on-accent font-semibold hover:brightness-110",
  approve: "border border-transparent bg-ok text-white font-semibold hover:brightness-110",
  change: "border border-line bg-surface text-change-ink font-medium hover:border-[#C99A8E]",
  link: "border-0 bg-transparent p-0 text-accent font-semibold hover:underline",
  "outline-accent": "border border-accent bg-surface text-accent font-semibold hover:bg-soft",
};
// Every variant has a 1px border (transparent when filled), so a primary and a secondary of the same size are the same height.
const sizes = { sm: "h-8 rounded-lg px-3 text-meta", md: "h-9 rounded-lg px-3.5 text-body", lg: "h-10 rounded-lg px-4 text-body" };

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn({ variant = "secondary", size = "md", className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-snap enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:flex-none", variant !== "link" && sizes[size], variants[variant], className)}
      {...rest}
    />
  );
});

/** A square icon-only button: one size and shape everywhere. `label` is required, because the icon alone says nothing to a screen reader. */
export const IconBtn = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }>(
  function IconBtn({ label, size = "md", className, type = "button", children, ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} title={label}
        className={cx("inline-flex flex-none items-center justify-center rounded-lg text-mute-2 transition-[background-color,color,transform] duration-150 ease-snap hover:bg-hover hover:text-ink enabled:active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-4", size === "sm" ? "size-7" : "size-8", className)}
        {...rest}>
        {children}
      </button>
    );
  },
);

/* ---------------------------------------------------------------- chips and marks */

/**
 * The one tag shape: a pill, 22px (xs/sm) or 26px (md) tall, 13–14px text, medium weight.
 * `round` is kept for older call sites; every chip is a pill now.
 */
export function Chip({ color, children, size = "sm", className, title }: { color: string; children: ReactNode; round?: boolean; size?: "xs" | "sm" | "md"; className?: string; title?: string }) {
  const s = { xs: "h-[22px] px-2 text-small", sm: "h-[22px] px-2.5 text-small", md: "h-[26px] px-3 text-meta" }[size];
  return (
    <span title={title} className={cx(PILL_SHAPE, s, className)} style={{ background: hexA(color, 0.12), color: readable(color, 0.12) }}>
      {children}
    </span>
  );
}

export function Avatar({ initials, size = 22, mono, className, title }: { initials: string; size?: number; mono?: boolean; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx("flex flex-none items-center justify-center rounded-full bg-avatar font-semibold text-mute-1", mono && "font-mono font-semibold", className)}
      style={{ width: size, height: size, fontSize: onScale(size * 0.42) }}
    >
      {initials}
    </span>
  );
}

export function Mark({ mark, color, size = 28, radius, fg, className }: { mark: string; color: string; size?: number; radius?: number; fg?: string; className?: string }) {
  return (
    <span
      className={cx("flex flex-none items-center justify-center font-semibold theme-fade", className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size / 4), background: color, color: fg ?? (color.startsWith("var(") ? "#FFFFFF" : onColor(color)), fontSize: onScale(size * 0.36), letterSpacing: "-0.01em" }}
    >
      {mark}
    </span>
  );
}

export function CodeTile({ code, color, size = 28, height, className, style }: { code: string; color: string; size?: number; height?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cx("flex flex-none items-center justify-center font-mono font-semibold", className)}
      style={{
        width: height ? undefined : size, height: height ?? size, borderRadius: height ? 0 : Math.round(size / 4.2),
        background: hexA(color, height ? 0.1 : 0.12), color: readable(color), letterSpacing: height ? "0.1em" : "0.06em",
        fontSize: height ? 14 : onScale(size * 0.36), ...style,
      }}
    >
      {code}
    </span>
  );
}

export function Blocks({ blocks, size = 12, gap = 3 }: { blocks: { id: string; color: string; title: string; ring: string; onClick?: () => void }[]; size?: number; gap?: number }) {
  if (!blocks.length) return null;
  return (
    <span className="flex flex-wrap" style={{ gap }}>
      {blocks.map((b) => (
        <span key={b.id} title={b.title} className="flex-none" style={{ width: size, height: size, borderRadius: 3, background: b.color, boxShadow: b.ring }} />
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------- surfaces */

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cx("rounded-xl border border-line bg-surface shadow-card theme-fade", className)} style={style}>{children}</div>;
}

/**
 * An empty state: a short title if it needs one, one plain sentence saying
 * what goes here, and at most one button. No illustration.
 */
export function Empty({ title, body, children, compact }: { title?: string; body?: ReactNode; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("rounded-xl border border-dashed border-line-strong bg-surface/60 text-center", compact ? "px-6 py-7" : "px-6 py-10 sm:py-12")}>
      {title && <div className="mb-1.5 text-lead font-semibold text-ink">{title}</div>}
      {body && <div className="mx-auto mb-5 max-w-[46ch] text-body leading-[1.55] text-mute-2 text-pretty">{body}</div>}
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ArchivedNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 rounded-xl border border-dashed border-line-strong bg-wash-2 px-4 py-3", className)}>
      <span className="eyebrow flex-none text-micro text-mute-1">Archived</span>
      <span className="flex-1 text-body text-mute-1">{children}</span>
    </div>
  );
}

export function ChangeNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-[rgba(194,65,18,.25)] bg-[rgba(194,65,18,.07)] px-4 py-3", className)}>
      <div className="eyebrow mb-1 text-change-ink">Changes requested</div>
      <div className="max-w-[70ch] text-body leading-[1.55] text-[#7A3211] text-pretty">{children}</div>
    </div>
  );
}

export function Warn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 rounded-xl border border-[rgba(201,154,46,.35)] bg-[rgba(201,154,46,.08)] px-4 py-3", className)}>
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-warn" />
      <span className="flex-1 text-body text-warn-ink">{children}</span>
    </div>
  );
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl bg-wash px-4 py-3 text-body leading-[1.55] text-[#46534D] text-pretty", className)}>{children}</div>;
}

/* ---------------------------------------------------------------- toggles */

export function Pills<T extends string>({
  options, value, onChange, className, label,
}: {
  options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string; label?: string;
  /** No longer changes anything: selection is always the accent. Kept so older call sites still compile. */
  tone?: "accent" | "dark";
}) {
  return (
    <div className={cx("flex flex-wrap gap-1.5", className)} role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-full border px-3 py-1 text-body font-medium transition-colors duration-150",
              on ? "border-accent bg-soft font-semibold text-accent" : "border-line bg-surface text-mute-1 hover:border-mute-4 hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cx("ml-1.5 tabular-nums text-small", on ? "" : "text-mute-4")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Tick({ on, size = 17 }: { on: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex flex-none items-center justify-center font-semibold text-white transition"
      style={{ width: size, height: size, borderRadius: 5, border: `1.5px solid ${on ? "var(--bos-accent)" : "#C9D3CE"}`, background: on ? "var(--bos-accent)" : "#FFFFFF", fontSize: size * 0.6 }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

export function CheckRow({ on, onClick, children, sub, className }: { on: boolean; onClick: () => void; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className={cx("flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 text-left hover:border-mute-2", className)}>
      <Tick on={on} />
      <span className="flex-1 text-body font-medium">{children}</span>
      {sub && <span className="flex-none text-small text-mute-4">{sub}</span>}
    </button>
  );
}

/* ---------------------------------------------------------------- form fields */

/**
 * A labelled form control. `required` adds the red asterisk (and tells
 * screen readers); `error` shows a message under the control.
 */
export function Field({ label, children, hint, className, required, error }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string; required?: boolean; error?: ReactNode }) {
  return (
    <label className={cx("block", className)} data-invalid={error ? "" : undefined}>
      <span className="label flex justify-between gap-2">
        <span>{label}{required && <><span aria-hidden className="ml-0.5 text-mute-3">*</span><span className="sr-only"> (required)</span></>}</span>
        {hint}
      </span>
      {children}
      {error && <span role="alert" className="mt-1.5 block text-meta font-medium text-[#B42318]">{error}</span>}
    </label>
  );
}

/** The "* Required" legend that sits at the top of forms with required fields. */
export function RequiredNote({ className }: { className?: string }) {
  return <p className={cx("m-0 text-small text-mute-3", className)}><span aria-hidden>*</span> Required</p>;
}

export function Select({ value, onChange, options, className, ...rest }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value">) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx("field", className)} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ArchExpander<T extends { id: string; name: string }>({ items, noun, onOpen }: { items: T[]; noun: string; onOpen: (x: T) => void }) {
  if (!items.length) return null;
  return (
    <details className="group mt-4">
      {/* A real button: it is the only way to reach archived things. */}
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-line bg-surface px-3 text-meta font-medium text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{items.length} archived {items.length === 1 ? noun : noun + "s"} ▾</span>
        <span className="hidden group-open:inline">Hide the {items.length} archived {items.length === 1 ? noun : noun + "s"} ▴</span>
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {items.map((x) => (
          <button key={x.id} type="button" onClick={() => onOpen(x)} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-2.5 text-left hover:border-mute-3 hover:bg-surface">
            <span className="min-w-0 flex-1 truncate text-body text-mute-1">{x.name}</span>
            <span className="eyebrow flex-none text-micro">Archived</span>
          </button>
        ))}
      </div>
    </details>
  );
}

