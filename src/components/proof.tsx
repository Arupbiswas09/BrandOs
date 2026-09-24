"use client";

import { useEffect, useRef, useState } from "react";
import type { Asset } from "@/db/schema";
import { deleteComment, postComment, toggleResolve } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { CommentText } from "@/components/discussion";
import { Avatar, Btn, Hint, Pills, cx } from "@/components/ui";
import { pinsOn, proofFiles, type PinnedComment } from "./proof-link";

type Filter = "open" | "resolved" | "all";
/** Where a new pin sits. `key` means it came from the keyboard, so the pin (not the note box) takes focus. */
type Spot = { x: number; y: number; via?: "key" | "pointer" };

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v * 100) / 100));
const short = (t: string, n = 80) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

/**
 * Proofing: an image with numbered notes pinned where they apply. Click or
 * tap the image to drop a pin; keyboard users press "Pin a note" and move it
 * with the arrow keys. Hovering or picking a pin lights up its note, and
 * picking a note lights up its pin.
 */
export function ProofView({ a, fileKey: startFile, pinId: startPin }: { a: Asset; fileKey?: string; pinId?: string }) {
  const { ws } = useApp();
  const { images, pdfs } = proofFiles(a);
  const all = ws.commentsOf("asset", a.id);
  const startComment = startPin ? all.find((c) => c.id === startPin) : undefined;
  const [fileKey, setFileKey] = useState(() => startComment?.fileKey ?? startFile ?? images[0]?.key ?? "");
  const [active, setActive] = useState<string | null>(startComment?.id ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(startComment?.resolved ? "all" : "open");
  const [full, setFull] = useState(false);
  const [draft, setDraft] = useState<Spot | null>(null);

  const file = images.find((f) => f.key === fileKey) ?? images[0];
  const pins = file ? pinsOn(all, file.key!) : [];
  const number = new Map(pins.map((c, i) => [c.id, i + 1]));
  const shown = pins.filter((c) => filter === "all" || (filter === "open" ? !c.resolved : c.resolved));
  const openN = pins.filter((c) => !c.resolved).length;
  const canPin = ws.can("comment");

  // Bring the selected pin and its note into view, wherever the selection came from.
  useEffect(() => {
    if (!active) return;
    document.getElementById(`pin-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    document.getElementById(`note-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, full]);

  // Full screen sits above the drawer, so Esc has to close it (or the draft) before the app's own Esc handler runs.
  const hasDraft = !!draft;
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (hasDraft) setDraft(null); else setFull(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full, hasDraft]);

  const pickFile = (k: string) => { setFileKey(k); setActive(null); setDraft(null); };

  const body = (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        // Esc drops an unfinished pin before it closes the drawer behind it.
        if (e.key === "Escape" && draft) { e.stopPropagation(); setDraft(null); }
      }}
    >
      {images.length > 1 && (
        <Pills label="Image" value={file?.key ?? ""} onChange={pickFile}
          options={images.map((f) => ({ value: f.key!, label: short(f.name, 28), count: pinsOn(all, f.key!).filter((c) => !c.resolved).length }))} />
      )}
      {file && (
        <div className="flex flex-wrap items-center gap-2">
          <Pills label="Show notes" value={filter} onChange={setFilter} options={[
            { value: "open", label: "Open", count: openN },
            { value: "resolved", label: "Resolved", count: pins.length - openN },
            { value: "all", label: "All", count: pins.length },
          ]} />
          <span className="flex-1" />
          {canPin && !draft && <Btn size="sm" onClick={() => { setActive(null); setDraft({ x: 50, y: 50, via: "key" }); }}>+ Pin a note</Btn>}
          <Btn size="sm" onClick={() => setFull(!full)} aria-pressed={full}>{full ? "Exit full screen" : "Full screen"}</Btn>
        </div>
      )}

      {file ? (
        <div className={cx("grid gap-4", full && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
          <Stage
            src={`${file.url}?inline=1`} name={file.name} pins={shown} number={number} active={active} hover={hover} canPin={canPin} draft={draft}
            onPlace={(s) => { setActive(null); setDraft(s); }} onMove={setDraft}
            onPick={(id) => { setDraft(null); setActive(id); }} onHover={setHover}
          />
          <div className={cx("flex min-w-0 flex-col gap-2", full && "lg:max-h-[calc(100dvh-150px)] lg:overflow-y-auto lg:pr-1")}>
            {draft && canPin && <DraftNote key={`${file.key}`} a={a} fileKey={file.key!} spot={draft} n={pins.length + 1} onDone={() => setDraft(null)} />}
            {shown.map((c) => (
              <PinNote key={c.id} c={c} n={number.get(c.id)!} on={active === c.id || hover === c.id}
                onPick={() => { setDraft(null); setActive(active === c.id ? null : c.id); }} onHover={setHover} />
            ))}
            {!shown.length && !draft && (
              <div className="rounded-xl border border-dashed border-line-strong p-6 text-center text-[15px] text-mute-2">
                {pins.length === 0 ? (canPin ? "No notes on this image yet. Click or tap the spot you want to talk about." : "No notes on this image yet.")
                  : filter === "open" ? "Every note here is resolved." : "No resolved notes yet."}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong p-9 text-center text-[15px] text-mute-2">Upload a PNG, JPG, GIF or WebP to pin notes on it.</div>
      )}

      {file && (
        <Hint>
          {canPin
            ? "Click or tap the spot you mean to pin a note there. On a keyboard, use “Pin a note”, move the pin with the arrow keys (Shift moves further), then write the note."
            : "You can read the notes here. Your role cannot add them."}
        </Hint>
      )}

      {pdfs.length > 0 && (
        <div className="rounded-xl border border-line px-[18px] py-1">
          {pdfs.map((f) => (
            <div key={f.key ?? f.name} className="flex flex-wrap items-center gap-3 border-t border-divider py-3 first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{f.name}</span>
                <span className="block text-[13.5px] text-mute-3">PDFs cannot be pinned here. Download it, then leave notes in the discussion.</span>
              </span>
              <a href={f.url} download={f.name} className="flex-none rounded-[7px] border border-line bg-white px-[11px] py-[5px] text-[14px] font-semibold text-accent hover:border-accent">Download to review</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!full) return body;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={`Proof ${file?.name ?? a.name}`}>
      <div className="flex flex-none items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{a.name}</span>
          <span className="block truncate text-[13.5px] text-mute-3">{file?.name}</span>
        </span>
        <Btn size="sm" autoFocus onClick={() => setFull(false)}>Close</Btn>
      </div>
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{body}</div>
    </div>
  );
}

function Stage({ src, name, pins, number, active, hover, canPin, draft, onPlace, onMove, onPick, onHover }: {
  src: string; name: string; pins: PinnedComment[]; number: Map<string, number>; active: string | null; hover: string | null;
  canPin: boolean; draft: Spot | null; onPlace: (s: Spot) => void; onMove: (s: Spot) => void; onPick: (id: string) => void; onHover: (id: string | null) => void;
}) {
  const draftRef = useRef<HTMLButtonElement>(null);
  const keyed = draft?.via === "key";
  // A pin dropped from the keyboard takes focus so the arrow keys move it; a click focuses the note box instead.
  useEffect(() => { if (keyed) draftRef.current?.focus(); }, [keyed]);

  return (
    <div className="min-w-0">
      <div
        className={cx("relative touch-manipulation select-none overflow-hidden rounded-xl border border-line bg-wash", canPin && "cursor-crosshair")}
        onClick={(e) => {
          if (!canPin) return;
          const r = e.currentTarget.getBoundingClientRect();
          onPlace({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100), via: "pointer" });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file */}
        <img src={src} alt={name} draggable={false} className="block h-auto w-full" />
        {pins.map((c) => {
          const n = number.get(c.id)!;
          const on = active === c.id || hover === c.id;
          return (
            <button
              key={c.id}
              id={`pin-${c.id}`}
              type="button"
              aria-label={`Note ${n}: ${short(c.text)}${c.resolved ? " (resolved)" : ""}`}
              aria-pressed={active === c.id}
              onClick={(e) => { e.stopPropagation(); onPick(c.id); }}
              onMouseEnter={() => onHover(c.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(c.id)}
              onBlur={() => onHover(null)}
              className={cx(
                "absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-mono text-[13px] font-bold shadow-[0_2px_8px_rgba(16,22,20,.35)] transition",
                c.resolved ? "bg-[#94A3B8] text-white opacity-75" : "bg-accent text-on-accent",
                on && "z-[2] scale-125 opacity-100 ring-4 ring-accent/30",
              )}
              style={{ left: `${c.pinX}%`, top: `${c.pinY}%` }}
            >
              {n}
            </button>
          );
        })}
        {draft && (
          <button
            ref={draftRef}
            type="button"
            aria-label={`New note pin at ${Math.round(draft.x)}% across, ${Math.round(draft.y)}% down. Arrow keys move it; Tab to write the note.`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 2;
              const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
              if (!d) return;
              e.preventDefault();
              onMove({ ...draft, x: clamp(draft.x + d[0]), y: clamp(draft.y + d[1]) });
            }}
            className="absolute z-[3] flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-pop items-center justify-center rounded-full border-2 border-dashed border-white bg-ink font-bold text-white shadow-[0_2px_10px_rgba(16,22,20,.45)]"
            style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

function DraftNote({ a, fileKey, spot, n, onDone }: { a: Asset; fileKey: string; spot: Spot; n: number; onDone: () => void }) {
  const [run, pending] = useAction();
  const [text, setText] = useState("");
  const post = async () => {
    if (!text.trim()) return;
    const r = await run(postComment, "asset", a.id, text, [], [], { fileKey, x: spot.x, y: spot.y });
    if (r.ok) onDone();
  };
  return (
    <div className="rounded-xl border border-accent bg-white px-3.5 py-3 ring-1 ring-accent">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink font-mono text-[12.5px] font-bold text-white">{n}</span>
        <span className="text-[14.5px] font-semibold">New note on this spot</span>
      </div>
      <textarea
        rows={3}
        value={text}
        autoFocus={spot.via !== "key"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void post(); } }}
        placeholder="What should change here?"
        aria-label={`Note ${n}`}
        className="field leading-[1.55]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[13px] text-mute-3">⌘↵ to post · Esc to cancel</span>
        <Btn size="sm" onClick={onDone}>Cancel</Btn>
        <Btn size="sm" variant="primary" disabled={pending || !text.trim()} onClick={post}>Pin note</Btn>
      </div>
    </div>
  );
}

function PinNote({ c, n, on, onPick, onHover }: { c: PinnedComment; n: number; on: boolean; onPick: () => void; onHover: (id: string | null) => void }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const mine = c.userId === ws.me.id;
  return (
    <div
      id={`note-${c.id}`}
      onMouseEnter={() => onHover(c.id)}
      onMouseLeave={() => onHover(null)}
      className={cx("rounded-xl border px-3.5 py-3 transition", on ? "border-accent bg-soft ring-1 ring-accent" : "border-line bg-white", c.resolved && !on && "bg-[#F8FAFC] opacity-70")}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={onPick} aria-pressed={on} aria-label={`Show note ${n} on the image`}
          className={cx("flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[12.5px] font-bold", c.resolved ? "bg-[#94A3B8] text-white" : "bg-accent text-on-accent")}>
          {n}
        </button>
        <Avatar initials={ws.user(c.userId).initials} size={22} mono />
        <span className="text-[14.5px] font-semibold">{ws.first(c.userId)}</span>
        {c.resolved && <span className="eyebrow text-[11.5px]">Resolved</span>}
        <span className="flex-1" />
        <span className="font-mono text-[12.5px] text-mute-4">{ws.ago(c.createdAt)}</span>
        {ws.can("comment") && (
          <button type="button" disabled={pending} onClick={() => run(toggleResolve, c.id)} aria-label={`${c.resolved ? "Reopen" : "Resolve"} note ${n}`} className="px-1 py-0.5 text-[13px] text-mute-3 hover:text-ink">{c.resolved ? "Reopen" : "Resolve"}</button>
        )}
        {(mine || ws.can("del")) && (
          <button type="button" disabled={pending} onClick={() => { if (window.confirm(`Delete note ${n}?`)) void run(deleteComment, c.id); }} className="px-1 py-0.5 text-[13px] text-mute-3 hover:text-danger">Delete</button>
        )}
      </div>
      <div onClick={onPick} className="cursor-pointer">
        <CommentText c={c} />
      </div>
    </div>
  );
}
