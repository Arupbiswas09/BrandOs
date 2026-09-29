"use client";

import type { KeyboardEvent, PointerEvent, MouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { FunnelBox } from "@/db/schema";
import { KIND_LABEL, boxWidth } from "@/lib/funnel";
import { cx } from "@/components/ui";
import { CodeBadge, OpenLink, type Resolved } from "./linked";

/*
 * One box on the funnel board. Editors get a button they can select, drag
 * and move with the arrow keys, plus a separate ↗ that opens the linked
 * item. Viewers get the same face; a linked box is one link that opens it.
 */

export const DEFAULT_TEXT: Record<FunnelBox["kind"], string> = { step: "New step", stage: "New stage", note: "New note" };

const SHELL: Record<FunnelBox["kind"], string> = {
  step: "rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-ink shadow-[0_1px_2px_rgba(15,23,42,.05)]",
  stage: "rounded-full border border-transparent bg-accent px-5 py-3 text-center text-on-accent shadow-[0_1px_3px_rgba(15,23,42,.14)] theme-fade",
  note: "rounded-[6px] border border-[#FDE68A] bg-[#FEF3C7] px-3 py-2.5 text-left text-[#713F12] shadow-[0_2px_6px_rgba(120,53,15,.10)]",
};

const OPEN_BTN: Record<FunnelBox["kind"], string> = {
  step: "text-mute-3 hover:bg-chip hover:text-ink",
  stage: "text-on-accent hover:bg-white/15",
  note: "text-[#713F12] hover:bg-[#FDE68A]",
};

/** "Step: Email automation", for screen readers and arrow descriptions. */
export function boxName(b: FunnelBox, r: Resolved | null) {
  const name = r ? r.name : b.text.trim() || `Empty ${KIND_LABEL[b.kind].toLowerCase()}`;
  return name.length > 80 ? name.slice(0, 79) + "…" : name;
}

/** What a box shows. On linked cards the ↗ sits bottom right, so the name gets the full width. */
function Face({ box, r }: { box: FunnelBox; r: Resolved | null }) {
  const room = r?.open && box.kind !== "stage" ? "pr-5" : "";
  const note = box.text.trim() && (
    <span className={cx("mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-[1.4] line-clamp-3", box.kind === "stage" ? "" : "text-mute-2", room)}>{box.text}</span>
  );
  if (!r) {
    return (
      <span className={cx("whitespace-pre-wrap break-words leading-[1.35] line-clamp-5", box.kind === "stage" ? "text-[14px] font-bold" : "text-[14px] font-medium", !box.text.trim() && "italic opacity-80")}>
        {box.text.trim() ? box.text : `Empty ${KIND_LABEL[box.kind].toLowerCase()}`}
      </span>
    );
  }
  if (box.kind === "stage") {
    return (
      <span className="block">
        <span className="break-words text-[14px] font-bold leading-[1.3] line-clamp-2">{r.name}</span>
        <span className="mt-0.5 block truncate text-[12px] font-medium">{r.sub}</span>
        {note}
      </span>
    );
  }
  return (
    <span className="flex items-start gap-2">
      <CodeBadge code={r.code} color={r.color} />
      <span className="min-w-0 flex-1">
        <span className={cx("break-words text-[14px] font-semibold leading-[1.3] line-clamp-2", r.missing && "text-mute-2")}>{r.name}</span>
        <span className={cx("mt-0.5 block truncate text-[12.5px] leading-[1.35] text-mute-3", room)}>{r.sub}</span>
        {note}
      </span>
    </span>
  );
}

type Handlers = {
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => void;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
};

export function BoxView({ box, r, editable, selected, drawing, lifted, measure, handlers }: {
  box: FunnelBox;
  r: Resolved | null;
  editable: boolean;
  selected: boolean;
  /** While an arrow is being drawn: this box is where it starts, or a place it could end. */
  drawing: "source" | "target" | null;
  lifted: boolean;
  measure: (el: HTMLDivElement | null) => void | (() => void);
  handlers: Handlers;
}) {
  const label = `${KIND_LABEL[box.kind]}: ${boxName(box, r)}${r && !r.missing ? `, ${r.sub}` : ""}`;
  const openPad = r?.open && box.kind === "stage" ? "px-8" : "";
  const open = r?.open && (
    <OpenLink
      target={r.open}
      label={`Open ${r.name}`}
      className={cx(
        "absolute flex h-[22px] w-[22px] items-center justify-center rounded-md transition-colors",
        box.kind === "stage" ? "right-2.5 top-1/2 -translate-y-1/2" : "bottom-1.5 right-1.5",
        OPEN_BTN[box.kind],
      )}
    >
      <ArrowUpRight aria-hidden size={15} strokeWidth={2.25} />
    </OpenLink>
  );

  return (
    <div
      ref={measure}
      data-box-id={box.id}
      className={cx("absolute", lifted ? "z-[6]" : selected ? "z-[5]" : "z-[3]")}
      style={{ left: box.x, top: box.y, width: boxWidth(box) }}
    >
      {editable ? (
        <>
          <button
            type="button"
            data-funnel-box={box.id}
            aria-label={label}
            aria-pressed={selected}
            className={cx(
              "block w-full touch-none select-none transition-[box-shadow,outline-color] duration-100",
              SHELL[box.kind], openPad,
              selected && (box.kind === "stage" ? "ring-2 ring-accent ring-offset-2" : "ring-2 ring-accent"),
              drawing === "source" && "ring-2 ring-accent ring-offset-2",
              drawing === "target" && "cursor-crosshair outline-2 outline-offset-2 outline-dashed outline-accent/50 hover:outline-accent",
              !drawing && (lifted ? "cursor-grabbing shadow-[0_12px_28px_-8px_rgba(15,23,42,.3)]" : "cursor-grab"),
            )}
            {...handlers}
          >
            <Face box={box} r={r} />
          </button>
          {open}
        </>
      ) : r?.open ? (
        <OpenLink target={r.open} label={`Open ${r.name} (${r.sub})`} className={cx("group block w-full transition hover:brightness-[.98]", SHELL[box.kind], openPad)}>
          <Face box={box} r={r} />
          <ArrowUpRight aria-hidden size={15} strokeWidth={2.25} className={cx("absolute", box.kind === "stage" ? "right-3 top-1/2 -translate-y-1/2" : "bottom-2 right-2", box.kind === "step" && "text-mute-3")} />
        </OpenLink>
      ) : (
        <div className={SHELL[box.kind]}><Face box={box} r={r} /></div>
      )}
    </div>
  );
}
