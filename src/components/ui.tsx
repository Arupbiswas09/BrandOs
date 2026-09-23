"use client";

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { hexA } from "@/lib/color";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- type */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("eyebrow", className)}>{children}</div>;
}

export function PageHead({
  eyebrow, title, sub, actions, size = 34,
}: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; size?: number }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && <Eyebrow className="mb-[9px] tracking-[0.13em]">{eyebrow}</Eyebrow>}
          <h1 className="m-0 font-serif font-normal leading-[1.1] tracking-[-0.02em]" style={{ fontSize: size }}>{title}</h1>
        </div>
        {actions && <div className="flex flex-none flex-wrap gap-2">{actions}</div>}
      </div>
      {sub && <p className="mb-7 max-w-[60ch] text-[14px] text-[#71807A] text-pretty">{sub}</p>}
    </>
  );
}

export function H2({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  if (!right) return <h2 className={cx("m-0 mb-3.5 text-[13px] font-semibold tracking-[-0.005em]", className)}>{children}</h2>;
  return (
    <div className={cx("mb-3.5 flex items-baseline justify-between gap-4", className)}>
      <h2 className="m-0 text-[13px] font-semibold tracking-[-0.005em]">{children}</h2>
      {right}
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto max-w-[1060px] animate-rise px-4 pb-[88px] pt-8 sm:px-8 sm:pt-10", className)}>{children}</div>;
}

/* ---------------------------------------------------------------- buttons */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "approve" | "change" | "link" | "outline-accent";
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" };

const variants: Record<BtnVariant, string> = {
  primary: "border-0 bg-accent text-on-accent font-semibold hover:brightness-110 theme-fade",
  secondary: "border border-line bg-white text-ink-3 font-medium hover:border-mute-2",
  ghost: "border-0 bg-transparent text-mute-2 hover:text-ink",
  danger: "border border-line bg-white text-danger font-medium hover:border-[#C99A8E]",
  dark: "border-0 bg-ink text-white font-semibold hover:bg-black",
  approve: "border-0 bg-ok text-white font-semibold hover:brightness-110",
  change: "border border-line bg-white text-change-ink font-medium hover:border-[#C99A8E]",
  link: "border-0 bg-transparent p-0 text-accent font-semibold hover:underline",
  "outline-accent": "border border-accent bg-white text-accent font-semibold hover:bg-soft",
};
const sizes = { sm: "rounded-[7px] px-[11px] py-[5px] text-[11.5px]", md: "rounded-[8px] px-[13px] py-[7px] text-[12.5px]", lg: "rounded-[9px] px-[15px] py-[9px] text-[12.5px]" };

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn({ variant = "secondary", size = "md", className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50", variant !== "link" && sizes[size], variants[variant], className)}
      {...rest}
    />
  );
});

/* ---------------------------------------------------------------- chips and marks */

export function Chip({ color, children, round, size = "sm", className, title }: { color: string; children: ReactNode; round?: boolean; size?: "xs" | "sm" | "md"; className?: string; title?: string }) {
  const s = { xs: "px-1.5 py-[2px] text-[10px]", sm: "px-2 py-[3px] text-[10.5px]", md: "px-2.5 py-[3px] text-[11.5px]" }[size];
  return (
    <span title={title} className={cx("inline-block flex-none font-semibold leading-[1.35]", round ? "rounded-full" : size === "xs" ? "rounded-[4px]" : "rounded-[5px]", s, className)} style={{ background: hexA(color, 0.14), color }}>
      {children}
    </span>
  );
}

export function Avatar({ initials, size = 22, mono, className, title }: { initials: string; size?: number; mono?: boolean; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx("flex flex-none items-center justify-center rounded-full bg-avatar font-semibold text-mute-1", mono && "font-mono font-bold", className)}
      style={{ width: size, height: size, fontSize: Math.max(8.5, Math.round(size * 0.38 * 10) / 10) }}
    >
      {initials}
    </span>
  );
}

export function Mark({ mark, color, size = 28, radius, fg = "#FFFFFF", className }: { mark: string; color: string; size?: number; radius?: number; fg?: string; className?: string }) {
  return (
    <span
      className={cx("flex flex-none items-center justify-center font-bold theme-fade", className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size / 4), background: color, color: fg, fontSize: Math.max(8.5, size * 0.32), letterSpacing: "-0.01em" }}
    >
      {mark}
    </span>
  );
}

export function CodeTile({ code, color, size = 28, height, className, style }: { code: string; color: string; size?: number; height?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cx("flex flex-none items-center justify-center font-mono font-bold", className)}
      style={{
        width: height ? undefined : size, height: height ?? size, borderRadius: height ? 0 : Math.round(size / 4.2),
        background: hexA(color, height ? 0.1 : 0.12), color, letterSpacing: height ? "0.1em" : "0.06em",
        fontSize: height ? 13 : Math.max(8.5, size * 0.3), ...style,
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
  return <div className={cx("rounded-[14px] border border-line bg-white theme-fade", className)} style={style}>{children}</div>;
}

export function Empty({ title, body, children, compact }: { title?: string; body?: ReactNode; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("rounded-[14px] border border-dashed border-line-strong text-center", compact ? "p-7" : "p-8 sm:p-[52px]")}>
      {title && <div className="mb-1.5 text-[14.5px] font-semibold">{title}</div>}
      {body && <div className="mx-auto mb-5 max-w-[46ch] text-[13px] leading-[1.55] text-mute-2 text-pretty">{body}</div>}
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ArchivedNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-[11px] rounded-[11px] border border-dashed border-line-strong bg-wash-2 px-4 py-[11px]", className)}>
      <span className="eyebrow flex-none text-[9.5px] text-mute-1">Archived</span>
      <span className="flex-1 text-[12.5px] text-mute-1">{children}</span>
    </div>
  );
}

export function ChangeNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-[12px] border border-[rgba(194,65,18,.25)] bg-[rgba(194,65,18,.07)] px-[18px] py-[13px]", className)}>
      <div className="eyebrow mb-[5px] text-change-ink">Changes requested</div>
      <div className="max-w-[70ch] text-[13px] leading-[1.55] text-[#7A3211] text-pretty">{children}</div>
    </div>
  );
}

export function Warn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 rounded-[11px] border border-[rgba(201,154,46,.35)] bg-[rgba(201,154,46,.08)] px-4 py-3", className)}>
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-warn" />
      <span className="flex-1 text-[12.5px] text-warn-ink">{children}</span>
    </div>
  );
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[11px] bg-wash px-[15px] py-[13px] text-[12.5px] leading-[1.55] text-[#71807A] text-pretty", className)}>{children}</div>;
}

/* ---------------------------------------------------------------- toggles */

export function Pills<T extends string>({
  options, value, onChange, tone = "accent", className, label,
}: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; tone?: "accent" | "dark"; className?: string; label?: string }) {
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
              "rounded-full border px-3 py-[5px] text-[12px] font-medium transition",
              on ? (tone === "dark" ? "border-ink bg-ink text-white" : "border-accent bg-accent text-on-accent") : "border-line bg-white text-mute-1 hover:border-mute-4",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cx("ml-1.5 font-mono text-[10.5px]", on ? "opacity-80" : "text-mute-4")}>{o.count}</span>}
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
      className="flex flex-none items-center justify-center font-bold text-white transition"
      style={{ width: size, height: size, borderRadius: 5, border: `1.5px solid ${on ? "var(--bos-accent)" : "#AFBDB7"}`, background: on ? "var(--bos-accent)" : "#FFFFFF", fontSize: size * 0.6 }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

export function CheckRow({ on, onClick, children, sub, className }: { on: boolean; onClick: () => void; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className={cx("flex w-full items-center gap-[11px] rounded-[10px] border border-line bg-white px-[13px] py-[11px] text-left hover:border-mute-2", className)}>
      <Tick on={on} />
      <span className="flex-1 text-[13px] font-medium">{children}</span>
      {sub && <span className="flex-none text-[10.5px] text-mute-4">{sub}</span>}
    </button>
  );
}

/* ---------------------------------------------------------------- form fields */

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label flex justify-between gap-2"><span>{label}</span>{hint}</span>
      {children}
    </label>
  );
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
    <details className="group mt-[18px]">
      <summary className="cursor-pointer list-none py-1.5 font-mono text-[12px] tracking-[0.04em] text-mute-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{items.length} archived {items.length === 1 ? noun : noun + "s"} ▾</span>
        <span className="hidden group-open:inline">Hide the {items.length} archived {items.length === 1 ? noun : noun + "s"} ▴</span>
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {items.map((x) => (
          <button key={x.id} type="button" onClick={() => onOpen(x)} className="flex w-full items-center gap-[11px] rounded-[10px] border border-dashed border-line px-3.5 py-2.5 text-left hover:border-mute-3 hover:bg-white">
            <span className="min-w-0 flex-1 truncate text-[13px] text-mute-1">{x.name}</span>
            <span className="eyebrow flex-none text-[9.5px]">Archived</span>
          </button>
        ))}
      </div>
    </details>
  );
}
