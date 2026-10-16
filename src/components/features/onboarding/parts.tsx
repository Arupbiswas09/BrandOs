"use client";

import type { ReactNode } from "react";
import type { Issue } from "@/lib/import-plan";
import { cx } from "@/components/ui";

/** A numbered step heading inside a card: "1  Where they go". */
export function StepTitle({ n, children, sub, right }: { n?: number; children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="m-0 flex items-center gap-2 text-lead font-semibold text-ink">
          {n !== undefined && <span aria-hidden className="flex size-6 flex-none items-center justify-center rounded-full bg-soft font-mono text-micro font-semibold text-accent">{n}</span>}
          {children}
        </h2>
        {sub && <p className={cx("mb-0 mt-1 max-w-[64ch] text-meta text-mute-2 text-pretty", n !== undefined && "sm:pl-8")}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** The words for a row's state: never colour alone. */
export function RowState({ include, issues, duplicate }: { include: boolean; issues: Issue[]; duplicate: null | "existing" | "earlier" }) {
  const error = issues.some((i) => i.level === "error");
  const warn = issues.some((i) => i.level === "warn");
  const [dot, word] = error ? ["bg-danger", "Skipped"] : !include && duplicate ? ["bg-mute-2", "Skipped"] : warn ? ["bg-warn", "Check"] : ["bg-ok", "Ready"];
  return (
    <span className="inline-flex flex-none items-center gap-1.5 text-small font-medium text-ink-3">
      <span aria-hidden className={cx("size-2 rounded-full", dot)} />
      {word}
    </span>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="m-0 mt-1.5 list-none space-y-0.5 p-0">
      {issues.map((i, k) => (
        <li key={k} className={cx("text-small leading-[1.45] text-pretty", i.level === "error" ? "text-danger" : "text-warn-text")}>{i.text}</li>
      ))}
    </ul>
  );
}

/** A two-way choice as small segmented buttons, for inside rows (Pills reads too loud there). */
export function Choice<T extends string>({ value, onChange, options, label, disabled }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-none rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(o.value)}
            className={cx("h-7 rounded-md px-2.5 text-small font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50", on ? "bg-soft font-semibold text-accent" : "text-mute-2 hover:text-ink")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
