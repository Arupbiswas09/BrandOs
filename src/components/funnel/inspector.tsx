"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowLeftRight, Spline, X } from "lucide-react";
import type { FunnelArrow, FunnelBox } from "@/db/schema";
import { MAX_LABEL, MAX_TEXT } from "@/lib/funnel";
import { Btn, Pills } from "@/components/ui";
import { LinkSelect, linkValue, type Resolved } from "./linked";

/*
 * The small popovers that open next to what is selected on the board:
 * one for a box (text, shape, link, draw an arrow, delete) and one for an
 * arrow (label, reverse, delete).
 */

const PANEL = "absolute z-[10] animate-pop rounded-xl border border-line bg-white p-3.5 text-left shadow-[0_14px_36px_-10px_rgba(15,23,42,.28)]";

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="eyebrow">{title}</span>
      <button type="button" aria-label="Close" title="Close (Esc)" onClick={onClose} className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-mute-3 transition-colors hover:bg-chip hover:text-ink">
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}

export function BoxInspector({ box, r, groups, style, autoFocus, onText, onKind, onLink, onDraw, onDelete, onClose }: {
  box: FunnelBox;
  r: Resolved | null;
  groups: Parameters<typeof LinkSelect>[0]["groups"];
  style: CSSProperties;
  autoFocus?: boolean;
  onText: (v: string) => void;
  onKind: (k: FunnelBox["kind"]) => void;
  onLink: (v: string) => void;
  onDraw: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const text = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    text.current?.focus({ preventScroll: true });
    text.current?.select();
  }, [autoFocus]);
  return (
    <div role="group" aria-label="Box" className={PANEL} style={style} onPointerDown={(e) => e.stopPropagation()}>
      <Head title="Box" onClose={onClose} />
      <textarea
        ref={text}
        rows={3}
        maxLength={MAX_TEXT}
        aria-label={box.link ? "Note on this box" : "Text in this box"}
        placeholder={box.link ? "Add a note (optional)" : "Write what happens here"}
        value={box.text}
        onChange={(e) => onText(e.target.value)}
        className="field px-3 py-2 text-[14.5px] leading-[1.45]"
      />
      <Pills
        label="Shape"
        tone="dark"
        className="mt-2.5 [&>button]:px-2.5 [&>button]:py-[3px] [&>button]:text-[13.5px]"
        value={box.kind}
        onChange={onKind}
        options={[{ value: "step", label: "Step" }, { value: "stage", label: "Stage" }, { value: "note", label: "Note" }]}
      />
      <LinkSelect
        label="What this box links to"
        empty="Not linked to anything"
        className="mt-2.5 px-2.5 py-2 text-[14px]"
        groups={groups}
        value={linkValue(box.link)}
        current={r ? `${r.name} (${r.sub})` : undefined}
        onChange={onLink}
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <Btn variant="primary" size="sm" onClick={onDraw}><Spline aria-hidden size={14} />Draw arrow from here</Btn>
        <button type="button" onClick={onDelete} className="rounded-md px-1.5 py-1 text-[14px] font-semibold text-danger hover:underline">Delete</button>
      </div>
    </div>
  );
}

export function ArrowInspector({ arrow, from, to, style, autoFocus, onLabel, onReverse, onDelete, onClose }: {
  arrow: FunnelArrow;
  from: string;
  to: string;
  style: CSSProperties;
  autoFocus?: boolean;
  onLabel: (v: string) => void;
  onReverse: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <div role="group" aria-label="Arrow" className={PANEL} style={style} onPointerDown={(e) => e.stopPropagation()}>
      <Head title="Arrow" onClose={onClose} />
      <p className="m-0 mb-2 truncate text-[13.5px] text-mute-2" title={`${from} → ${to}`}>{from} <span aria-hidden>→</span><span className="sr-only">to</span> {to}</p>
      <input
        ref={input}
        maxLength={MAX_LABEL}
        aria-label="Arrow label"
        placeholder="Label, e.g. form submit"
        value={arrow.label ?? ""}
        onChange={(e) => onLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onClose(); } }}
        className="field px-3 py-2 text-[14.5px]"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <Btn size="sm" onClick={onReverse}><ArrowLeftRight aria-hidden size={14} />Reverse</Btn>
        <button type="button" onClick={onDelete} className="rounded-md px-1.5 py-1 text-[14px] font-semibold text-danger hover:underline">Delete</button>
      </div>
    </div>
  );
}
