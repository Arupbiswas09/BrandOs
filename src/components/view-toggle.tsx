"use client";

import { LayoutGrid, List } from "lucide-react";
import { useStored } from "@/lib/stored";
import { cx } from "@/components/ui";

export type View = "list" | "grid";
const VIEWS = ["list", "grid"] as const;

/** Which way a list is shown, remembered per list in this browser. Lists are the default. */
export function useView(key: string): [View, (v: View) => void] {
  return useStored<View>(`bos:view:${key}`, "list", VIEWS);
}

/**
 * List or grid, as a two-button switch the height of the filter row's fields.
 * `gridLabel` names the second view ("Cards" for offers, "Grid" for assets).
 */
export function ViewToggle({ value, onChange, gridLabel = "Grid", className }: { value: View; onChange: (v: View) => void; gridLabel?: string; className?: string }) {
  const items: [View, string, typeof List][] = [["list", "List", List], ["grid", gridLabel, LayoutGrid]];
  return (
    <div role="group" aria-label="View" className={cx("flex h-10 flex-none items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5", className)}>
      {items.map(([v, label, Icon]) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            title={`Show as ${label.toLowerCase()}`}
            onClick={() => onChange(v)}
            className={cx(
              "inline-flex h-full items-center gap-1.5 rounded-lg px-2.5 text-meta font-medium transition-colors duration-150",
              on ? "bg-soft text-accent" : "text-mute-2 hover:bg-hover hover:text-ink",
            )}
          >
            <Icon aria-hidden size={16} />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
