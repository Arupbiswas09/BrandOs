"use client";

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Spline } from "lucide-react";
import type { Funnel, FunnelBox, FunnelLink, Offer } from "@/db/schema";
import type { Result } from "@/app/actions";
import { draftFunnel, saveFunnel } from "@/app/funnel-actions";
import {
  EMPTY_FUNNEL, GRID, MAX_ARROWS, MAX_BOXES, arrowLine, boxHeightGuess, boxWidth, buildDraft, clampCoord, draftSource, fid, snap, type Rect,
} from "@/lib/funnel";
import { plural } from "@/lib/ws";
import { useAction, useApp } from "@/components/app/provider";
import { SpotArt } from "@/components/art";
import { EmptyArt } from "@/components/polish";
import { Btn, Card, cx } from "@/components/ui";
import { BoxView, DEFAULT_TEXT, boxName } from "./box";
import { ArrowInspector, BoxInspector } from "./inspector";
import { FunnelIndex, LinkSelect, linkGroups, parseLinkValue, resolveLink, type Resolved } from "./linked";

/*
 * The funnel board on an offer page. Local state is the truth while you
 * edit; changes save themselves 600 ms after you stop. What the server sends
 * back is taken on only when nothing local is waiting to save, so a refresh
 * never undoes what you just did.
 */

type Sel = { kind: "box" | "arrow"; id: string; focus?: boolean } | null;
type Status = "idle" | "saving" | "saved" | "error";
type Drag = { id: string; pid: number; sx: number; sy: number; ox: number; oy: number; sl: number; st: number; moved: boolean };

const SAVE_AFTER = 600;
const PANEL_W = 300, PANEL_H = 300, ARROW_W = 280, ARROW_H = 200;
const LINE = "#7B8798";
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

const moveBox = (f: Funnel, id: string, x: number, y: number): Funnel => ({ ...f, boxes: f.boxes.map((b) => (b.id === id ? { ...b, x, y } : b)) });
const patchBox = (f: Funnel, id: string, p: Partial<Omit<FunnelBox, "link">>): Funnel => ({ ...f, boxes: f.boxes.map((b) => (b.id === id ? { ...b, ...p } : b)) });

/** The first gap on the board, scanning down each column from the left edge of what is on screen. */
function freeSpot(rects: Rect[], nb: Pick<FunnelBox, "kind" | "link">, left: number) {
  const w = boxWidth(nb), h = boxHeightGuess(nb), pad = GRID;
  const hit = (x: number, y: number) => rects.some((r) => x < r.x + r.w + pad && x + w + pad > r.x && y < r.y + r.h + pad && y + h + pad > r.y);
  const x0 = snap(Math.max(40, left + 40));
  for (let c = 0; c < 12; c++) {
    for (let row = 0; row < 40; row++) {
      const x = x0 + c * 260, y = 40 + row * 80;
      if (!hit(x, y)) return { x: clampCoord(x), y: clampCoord(y) };
    }
  }
  return { x: x0, y: 40 };
}

export function FunnelBoard({ offer }: { offer: Offer }) {
  const { ws, toast } = useApp();
  const [runAction, drafting] = useAction();
  // Used in SVG url(#…) references, so only plain characters.
  const uid = "fb" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const editable = ws.canChange(offer);
  const offerId = offer.id;
  const server = offer.funnel ?? EMPTY_FUNNEL;
  const serverKey = JSON.stringify(server);

  /* ---------------------------------------------------------------- state and sync */

  const [funnel, setFunnel] = useState<Funnel>(server);
  const [seenKey, setSeenKey] = useState(serverKey);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [drawFrom, setDrawFrom] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [viewW, setViewW] = useState(0);
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    if (!busy && !dragging) setFunnel(server);
  }

  const ref = useRef(funnel);
  useLayoutEffect(() => { ref.current = funnel; }, [funnel]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const ro = useRef<ResizeObserver | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inflight.current) { again.current = true; return; }
    inflight.current = true;
    setStatus("saving");
    let r: Result = { ok: true };
    do {
      again.current = false;
      try { r = await saveFunnel(offerId, ref.current); }
      catch { r = { ok: false, error: "The funnel did not save. Check your connection and try again." }; }
    } while (again.current);
    inflight.current = false;
    if (timer.current) return; // a newer change is already on its way
    if (r.ok) { setStatus("saved"); setBusy(false); }
    else { setStatus("error"); toast(r.error, "error"); }
  }, [offerId, toast]);

  const schedule = useCallback(() => {
    setBusy(true);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, SAVE_AFTER);
  }, [flush]);

  /** Applies a change locally at once; saves it unless `save` is false (mid-drag). */
  const change = useCallback((fn: (f: Funnel) => Funnel, save = true) => {
    const next = fn(ref.current);
    if (next === ref.current) return;
    ref.current = next;
    setFunnel(next);
    if (save) schedule();
  }, [schedule]);

  // Leaving the page (or this offer) with a save still waiting sends it straight away.
  useEffect(() => {
    const t = timer, f = ref;
    return () => {
      if (!t.current) return;
      clearTimeout(t.current);
      t.current = null;
      void saveFunnel(offerId, f.current);
    };
  }, [offerId]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => {
    if (!drawFrom) return;
    // Esc cancels drawing even when focus has wandered off the board.
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setDrawFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawFrom]);

  /* ---------------------------------------------------------------- measuring */

  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    ro.current ??= new ResizeObserver((entries) => {
      setSizes((prev) => {
        let next = prev;
        for (const en of entries) {
          const id = (en.target as HTMLElement).dataset.boxId;
          if (!id) continue;
          const h = Math.round(en.borderBoxSize?.[0]?.blockSize ?? en.contentRect.height);
          if (prev[id] === h) continue;
          if (next === prev) next = { ...prev };
          next[id] = h;
        }
        return next;
      });
    });
    const obs = ro.current;
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);
  useEffect(() => {
    const r = ro;
    return () => r.current?.disconnect();
  }, []);
  const hasBoxes = funnel.boxes.length > 0;
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setViewW(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasBoxes]);

  /* ---------------------------------------------------------------- derived */

  const resolved = useMemo(() => {
    const m = new Map<string, Resolved>();
    for (const b of funnel.boxes) if (b.link) m.set(b.id, resolveLink(ws, b.link));
    return m;
  }, [funnel.boxes, ws]);
  const rOf = (b: FunnelBox) => resolved.get(b.id) ?? null;
  const rectOf = (b: FunnelBox): Rect => ({ x: b.x, y: b.y, w: boxWidth(b), h: sizes[b.id] ?? boxHeightGuess(b) });
  const byId = new Map(funnel.boxes.map((b) => [b.id, b]));
  const groups = useMemo(() => (editable ? linkGroups(ws, offer) : []), [editable, ws, offer]);

  const rects = funnel.boxes.map(rectOf);
  // A little room to the right (the board grows as you drag); more underneath for new boxes.
  const contentW = Math.max(0, ...rects.map((r) => r.x + r.w)) + 40;
  const boardW = Math.max(contentW, viewW);
  const narrow = viewW > 0 && viewW < 640;
  const lines = funnel.arrows.flatMap((a) => {
    const f = byId.get(a.from), t = byId.get(a.to);
    const l = f && t ? arrowLine(rectOf(f), rectOf(t)) : null;
    return l && f && t ? [{ a, l, f, t }] : [];
  });

  // Where the popover for the selection sits: beside the box if there is room, otherwise under it.
  const selBox = sel?.kind === "box" && editable ? byId.get(sel.id) : undefined;
  const selArrow = sel?.kind === "arrow" && editable ? lines.find((x) => x.a.id === sel.id) : undefined;
  let panel: { left: number; top: number; w: number; h: number } | null = null;
  if (selBox) {
    const r = rectOf(selBox), gap = 14;
    const w = Math.min(PANEL_W, boardW - 16);
    if (!narrow && r.x + r.w + gap + w <= boardW - 8) panel = { left: r.x + r.w + gap, top: Math.max(8, r.y - 6), w, h: PANEL_H };
    else if (!narrow && r.x - gap - w >= 8) panel = { left: r.x - gap - w, top: Math.max(8, r.y - 6), w, h: PANEL_H };
    else panel = { left: Math.max(8, Math.min(r.x, boardW - w - 8)), top: r.y + r.h + gap, w, h: PANEL_H };
  } else if (selArrow) {
    const { mx, my } = selArrow.l;
    const w = Math.min(ARROW_W, boardW - 16);
    const left = mx + 16 + w <= boardW - 8 ? mx + 16 : Math.max(8, mx - 16 - w);
    panel = { left, top: Math.max(8, my + 14), w, h: ARROW_H };
  }
  const boardH = Math.max(360, Math.max(0, ...rects.map((r) => r.y + r.h)) + 200, panel ? panel.top + panel.h + 16 : 0);
  const overflowing = viewW > 0 && contentW > viewW + 1;

  // Keep an opened popover on screen when the board scrolls sideways.
  const panelLeft = panel?.left ?? -1, panelRight = panel ? panel.left + panel.w : -1;
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || panelLeft < 0) return;
    if (panelRight > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = panelRight - sc.clientWidth + 8;
    else if (panelLeft < sc.scrollLeft) sc.scrollLeft = Math.max(0, panelLeft - 8);
  }, [panelLeft, panelRight]);

  /* ---------------------------------------------------------------- actions */

  const focusBox = (id: string) => requestAnimationFrame(() => canvas.current?.querySelector<HTMLElement>(`[data-funnel-box="${id}"]`)?.focus({ preventScroll: true }));
  const focusArrow = (id: string) => requestAnimationFrame(() => canvas.current?.querySelector<HTMLElement>(`[data-funnel-arrow="${id}"]`)?.focus({ preventScroll: true }));

  const add = (kind: FunnelBox["kind"], link?: FunnelLink) => {
    if (ref.current.boxes.length >= MAX_BOXES) { toast(`A board holds up to ${MAX_BOXES} boxes.`, "error"); return; }
    const draft = { kind, ...(link && { link }) };
    const spot = freeSpot(ref.current.boxes.map(rectOf), draft, scroller.current?.scrollLeft ?? 0);
    const box: FunnelBox = { id: fid("b"), kind, text: link ? "" : DEFAULT_TEXT[kind], ...spot, ...(link && { link }) };
    change((f) => ({ ...f, boxes: [...f.boxes, box] }));
    setDrawFrom(null);
    setSel({ kind: "box", id: box.id, focus: !link });
    if (link) focusBox(box.id);
    requestAnimationFrame(() => canvas.current?.querySelector(`[data-box-id="${box.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  };

  const closeSel = () => {
    if (!sel) return;
    setSel(null);
    if (sel.kind === "box") focusBox(sel.id); else focusArrow(sel.id);
  };

  const removeSel = () => {
    if (!sel) return;
    const id = sel.id;
    if (sel.kind === "box") change((f) => ({ boxes: f.boxes.filter((b) => b.id !== id), arrows: f.arrows.filter((a) => a.from !== id && a.to !== id) }));
    else change((f) => ({ ...f, arrows: f.arrows.filter((a) => a.id !== id) }));
    setSel(null);
    canvas.current?.focus({ preventScroll: true });
  };

  /** A click or Enter on a box: select it, or finish the arrow being drawn. */
  const activate = (id: string) => {
    if (!editable) return;
    if (drawFrom) {
      const from = drawFrom;
      setDrawFrom(null);
      if (from === id) { setSel({ kind: "box", id }); return; }
      const existing = ref.current.arrows.find((a) => a.from === from && a.to === id);
      if (existing) { setSel({ kind: "arrow", id: existing.id, focus: true }); return; }
      if (ref.current.arrows.length >= MAX_ARROWS) { toast(`A board holds up to ${MAX_ARROWS} arrows.`, "error"); return; }
      const aid = fid("a");
      change((f) => ({ ...f, arrows: [...f.arrows, { id: aid, from, to: id }] }));
      setSel({ kind: "arrow", id: aid, focus: true });
      return;
    }
    setSel({ kind: "box", id });
  };

  const startDraw = (id: string) => {
    setSel(null);
    setDrawFrom(id);
    focusBox(id);
  };

  const setLink = (id: string, v: string) => {
    const link = parseLinkValue(v);
    change((f) => ({
      ...f,
      boxes: f.boxes.map((b) => {
        if (b.id !== id) return b;
        const { link: _old, ...rest } = b;
        // A placeholder like "New step" means nothing once the box names a real item.
        const text = link && rest.text === DEFAULT_TEXT[rest.kind] ? "" : rest.text;
        return link ? { ...rest, text, link } : rest;
      }),
    }));
  };

  /* ---------------------------------------------------------------- pointer and keys */

  const boxHandlers = (b: FunnelBox) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.focus({ preventScroll: true });
      if (drawFrom) return;
      const cur = ref.current.boxes.find((x) => x.id === b.id) ?? b;
      const sc = scroller.current;
      drag.current = { id: b.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, sl: sc?.scrollLeft ?? 0, st: sc?.scrollTop ?? 0, moved: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || d.pid !== e.pointerId) return;
      const sc = scroller.current;
      if (sc && d.moved) {
        const r = sc.getBoundingClientRect();
        if (e.clientX > r.right - 32) sc.scrollLeft += 14;
        else if (e.clientX < r.left + 32) sc.scrollLeft -= 14;
      }
      const dx = e.clientX - d.sx + (sc ? sc.scrollLeft - d.sl : 0);
      const dy = e.clientY - d.sy + (sc ? sc.scrollTop - d.st : 0);
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) { d.moved = true; setDragging(d.id); }
      change((f) => moveBox(f, d.id, clampCoord(d.ox + dx), clampCoord(d.oy + dy)), false);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (drawFrom) { activate(b.id); return; }
      const d = drag.current;
      if (!d || d.pid !== e.pointerId) return;
      drag.current = null;
      if (!d.moved) { activate(b.id); return; }
      setDragging(null);
      const cur = ref.current.boxes.find((x) => x.id === d.id);
      if (cur) change((f) => moveBox(f, d.id, clampCoord(snap(cur.x)), clampCoord(snap(cur.y))));
      setSel({ kind: "box", id: d.id });
    },
    onPointerCancel: () => {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      setDragging(null);
      change((f) => moveBox(f, d.id, d.ox, d.oy), false);
    },
    // Pointer clicks are handled on pointer up; this is Enter or Space.
    onClick: (e: MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) activate(b.id); },
    onDoubleClick: () => { if (!drawFrom) setSel({ kind: "box", id: b.id, focus: true }); },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (drawFrom || sel?.kind !== "box" || sel.id !== b.id) return;
      const step = e.shiftKey ? GRID * 5 : GRID;
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      e.preventDefault();
      const cur = ref.current.boxes.find((x) => x.id === b.id);
      if (!cur) return;
      change((f) => moveBox(f, b.id, clampCoord(snap(cur.x + d[0])), clampCoord(snap(cur.y + d[1]))));
      const el = e.currentTarget;
      requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
    },
  });

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      if (drawFrom) { e.stopPropagation(); const src = drawFrom; setDrawFrom(null); focusBox(src); return; }
      if (sel) { e.stopPropagation(); closeSel(); }
      return;
    }
    if (!editable || !sel || typing(e.target)) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
  };

  /* ---------------------------------------------------------------- render */

  const n = funnel.boxes.length, m = funnel.arrows.length;
  const linkedAssets = ws.linkedAssets(offer.id).filter((a) => !a.archived);
  const canDraft = buildDraft(draftSource(offer, linkedAssets)).boxes.length > 0;

  const head = (
    <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-5 gap-y-1.5">
      <div className="min-w-0">
        <h2 id={`${uid}-title`} className="m-0 mb-1 text-[17px] font-semibold">Funnel</h2>
        <p className="m-0 max-w-[64ch] text-[14.5px] text-mute-2 text-pretty">
          {editable
            ? "The whole path for this offer on one board. Drag boxes to arrange; select one to write in it, link it to a file, or draw an arrow from it."
            : "The whole path for this offer on one board. The ↗ on a linked box opens the file."}
        </p>
      </div>
      {n > 0 && <span className="font-mono text-[14px] text-mute-3">{plural(n, "box", "boxes")} · {plural(m, "arrow")}</span>}
    </div>
  );

  if (!n) {
    return (
      <section aria-labelledby={`${uid}-title`} className="mb-[34px]">
        {head}
        {editable ? (
          <EmptyArt
            art={<SpotArt kind="offer" />}
            title="Map how people move through this offer"
            body={
              linkedAssets.length
                ? `Draft one from the ${plural(linkedAssets.length, "asset")} already linked to it. It lays out ads and posts first, then the landing page, then the CTA and the goal, and you rearrange from there.`
                : canDraft
                  ? "Nothing is linked yet, so a draft starts from the CTA and the goal. Link assets first for a fuller map, or start blank."
                  : "Link some assets, or set a CTA and a goal, and BrandOS can draft it for you. Or start with a blank board."
            }
          >
            <Btn variant="primary" size="lg" disabled={drafting || busy || !canDraft} onClick={() => runAction(draftFunnel, offerId)}>
              <Spline aria-hidden size={16} />{drafting ? "Drafting…" : "Draft from linked assets"}
            </Btn>
            <Btn size="lg" disabled={drafting} onClick={() => add("step")}>Start blank</Btn>
          </EmptyArt>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong bg-white/60 px-5 py-6 text-[15px] text-mute-2">No funnel mapped yet.</div>
        )}
      </section>
    );
  }

  const saveNote = status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved" : "";

  return (
    <section aria-labelledby={`${uid}-title`} className="mb-[34px]" onKeyDown={onKeyDown}>
      {head}
      <Card className="overflow-hidden">
        {editable && (
          <div className="flex min-h-[54px] flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
            {drawFrom ? (
              <div role="status" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] bg-soft px-3 py-1.5 text-[14px] text-ink-2">
                <Spline aria-hidden size={15} className="flex-none text-hl-ink" />
                <span className="min-w-0 flex-1">Click the box this leads to — <span className="kbd">Esc</span> to cancel</span>
                <Btn size="sm" variant="ghost" onClick={() => { const src = drawFrom; setDrawFrom(null); focusBox(src); }}>Cancel</Btn>
              </div>
            ) : (
              <>
                <Btn size="sm" onClick={() => add("step")}>+ Step</Btn>
                <Btn size="sm" onClick={() => add("stage")}>+ Stage</Btn>
                <Btn size="sm" onClick={() => add("note")}>+ Note</Btn>
                <LinkSelect
                  label="Add a box linked to an asset, offer, service, CTA or Global Library file"
                  empty="+ Linked item…"
                  groups={groups}
                  value=""
                  onChange={(v) => { const l = parseLinkValue(v); if (l) add("step", l); }}
                  className="w-auto min-w-[160px] max-w-full flex-1 border-accent py-[5px] pl-2.5 pr-8 text-[14px] font-semibold text-hl-ink sm:max-w-[300px]"
                />
                <span className="ml-auto flex items-center gap-3">
                  <span role="status" className={cx("text-[13px]", status === "error" ? "font-semibold text-danger" : "text-mute-3")}>{saveNote}</span>
                  {status === "error" && <Btn size="sm" variant="link" onClick={() => void flush()}>Retry</Btn>}
                  <span className="hidden text-[13px] text-mute-3 lg:inline">Delete key removes what is selected</span>
                </span>
              </>
            )}
          </div>
        )}
        <div
          ref={scroller}
          data-scroll
          className="focus-inset relative overflow-x-auto overflow-y-hidden"
          {...(overflowing && { tabIndex: 0, role: "region", "aria-label": "Funnel board, scrolls sideways" })}
        >
          <div
            ref={canvas}
            tabIndex={-1}
            className={cx("relative outline-none", drawFrom && "cursor-crosshair")}
            style={{
              width: contentW, minWidth: "100%", height: boardH,
              backgroundImage: "radial-gradient(circle, rgba(100,116,139,.3) 1px, transparent 1.3px)",
              backgroundSize: `${GRID}px ${GRID}px`, backgroundPosition: `-${GRID / 2}px -${GRID / 2}px`,
            }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { setSel(null); setDrawFrom(null); } }}
          >
            <svg aria-hidden className="pointer-events-none absolute left-0 top-0 z-[1] overflow-visible" width={boardW} height={boardH}>
              <defs>
                <marker id={`${uid}-h`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0 0L10 5L0 10z" fill={LINE} />
                </marker>
                <marker id={`${uid}-s`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0 0L10 5L0 10z" style={{ fill: "var(--bos-accent)" }} />
                </marker>
              </defs>
              {lines.map(({ a, l }) => {
                const on = sel?.kind === "arrow" && sel.id === a.id;
                return (
                  <g key={a.id}>
                    <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={on ? 2 : 1.5} style={{ stroke: on ? "var(--bos-accent)" : LINE }} markerEnd={`url(#${uid}-${on ? "s" : "h"})`} />
                    {editable && (
                      <line
                        x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="transparent" strokeWidth={14} pointerEvents="stroke" className="cursor-pointer"
                        onPointerDown={(e) => { e.stopPropagation(); setDrawFrom(null); setSel({ kind: "arrow", id: a.id }); focusArrow(a.id); }}
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {funnel.boxes.map((b) => {
              const r = rOf(b);
              const on = sel?.kind === "box" && sel.id === b.id;
              return (
                <Fragment key={b.id}>
                <BoxView
                  box={b}
                  r={r}
                  editable={editable}
                  selected={on}
                  drawing={drawFrom ? (drawFrom === b.id ? "source" : "target") : null}
                  lifted={dragging === b.id}
                  measure={measure}
                  handlers={boxHandlers(b)}
                />
                {on && selBox && panel && (
                  <BoxInspector
                    box={b}
                    r={r}
                    groups={groups}
                    style={{ left: panel.left, top: panel.top, width: panel.w }}
                    autoFocus={sel?.focus}
                    onText={(v) => change((f) => patchBox(f, b.id, { text: v }))}
                    onKind={(k) => change((f) => patchBox(f, b.id, { kind: k }))}
                    onLink={(v) => setLink(b.id, v)}
                    onDraw={() => startDraw(b.id)}
                    onDelete={removeSel}
                    onClose={closeSel}
                  />
                )}
                </Fragment>
              );
            })}

            {lines.map(({ a, l, f, t }) => {
              const on = sel?.kind === "arrow" && sel.id === a.id;
              const lab = a.label?.trim();
              // Labels sit above ordinary boxes so a tight gap never hides them; the selected box and the popover still win.
              const chip = "absolute z-[4] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-white px-1.5 py-px text-[12px] font-medium leading-[1.5]";
              if (!editable) {
                return lab ? <span key={a.id} className={cx(chip, "max-w-[180px] truncate border-line text-mute-1")} style={{ left: l.mx, top: l.my }}>{lab}</span> : null;
              }
              const from = boxName(f, rOf(f)), to = boxName(t, rOf(t));
              return (
                <Fragment key={a.id}>
                <button
                  type="button"
                  data-funnel-arrow={a.id}
                  aria-label={`Arrow from ${from} to ${to}${lab ? `, labelled ${lab}` : ""}`}
                  aria-pressed={on}
                  title={lab ? undefined : "Arrow — click to label, reverse or delete"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { setDrawFrom(null); setSel({ kind: "arrow", id: a.id }); }}
                  className={cx(
                    lab ? cx(chip, "max-w-[180px] truncate") : "absolute z-[4] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white",
                    on ? "border-accent text-ink" : lab ? "border-line text-mute-1 hover:border-line-strong" : "border-[#7B8798] opacity-0 hover:opacity-100 focus-visible:opacity-100",
                  )}
                  style={{ left: l.mx, top: l.my }}
                >
                  {lab}
                </button>
                {on && panel && (
                  <ArrowInspector
                    arrow={a}
                    from={from}
                    to={to}
                    style={{ left: panel.left, top: panel.top, width: panel.w }}
                    autoFocus={sel?.focus}
                    onLabel={(v) => change((fn) => ({ ...fn, arrows: fn.arrows.map((x) => (x.id === a.id ? { ...x, label: v } : x)) }))}
                    onReverse={() => change((fn) => ({ ...fn, arrows: fn.arrows.map((x) => (x.id === a.id ? { ...x, from: x.to, to: x.from } : x)) }))}
                    onDelete={removeSel}
                    onClose={closeSel}
                  />
                )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </Card>
      <FunnelIndex funnel={funnel} />
    </section>
  );
}
