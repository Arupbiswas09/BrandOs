"use client";

import { useContext, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, MapPin, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Comment } from "@/db/schema";
import { href } from "@/lib/routes";
import { deleteComment, editComment, postComment, toggleResolve } from "@/app/actions";
import { useAction, useApp } from "./app/provider";
import { Avatar, Btn, IconBtn, cx } from "./ui";
import { PinLink, isPinned, pinsOn, type PinnedComment } from "./proof-link";

type Seg = { text: string; chip?: "ref" | "at"; to?: string };

function useSegments() {
  const { ws } = useApp();
  return (c: Comment): Seg[] => {
    const marks: { find: string; kind: "ref" | "at"; to?: string }[] = [];
    c.refs.forEach((id) => { const o = ws.offer(id); if (o) marks.push({ find: "#" + o.name, kind: "ref", to: href.offer(id) }); });
    c.mentions.forEach((id) => { const u = ws.user(id); if (u.id) marks.push({ find: "@" + u.name, kind: "at" }); });
    marks.sort((a, b) => b.find.length - a.find.length);
    let parts: Seg[] = [{ text: c.text }];
    for (const m of marks) {
      const out: Seg[] = [];
      for (const p of parts) {
        if (p.chip) { out.push(p); continue; }
        const bits = p.text.split(m.find);
        bits.forEach((bit, i) => {
          if (bit) out.push({ text: bit });
          if (i < bits.length - 1) out.push({ text: m.find, chip: m.kind, to: m.to });
        });
      }
      parts = out;
    }
    return parts;
  };
}

/**
 * A note's text with its #offer tags and @mentions. A tag is a real link (so
 * the keyboard reaches it too); `plain` keeps it as text, for a note shown
 * inside a row that is itself a link or button.
 */
export function CommentText({ c, plain }: { c: Comment; plain?: boolean }) {
  const segs = useSegments()(c);
  const chip = "mx-px inline rounded-sm px-1.5 py-px text-body font-semibold";
  return (
    <span className="block whitespace-pre-wrap text-body text-ink-2 text-pretty">
      {segs.map((s, i) =>
        s.chip === "ref" && s.to && !plain ? (
          <Link key={i} href={s.to} onClick={(e) => e.stopPropagation()} className={cx(chip, "bg-soft text-accent hover:underline")}>{s.text}</Link>
        ) : s.chip ? (
          <span key={i} className={cx(chip, s.chip === "ref" ? "bg-soft text-accent" : "bg-avatar text-ink-3")}>{s.text}</span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * What can be done with a note, the same in the discussion and the proof
 * view: Resolve or Reopen for anyone who comments, Edit for its author, and
 * Delete for its author or an admin. `n` is the pin number in the proof view.
 */
export function NoteActions({ c, n, onEdit }: { c: Comment; n?: number; onEdit?: () => void }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  // Every one of these is refused on the server without the right to comment.
  if (!ws.can("comment")) return null;
  const mine = c.userId === ws.me.id;
  const which = n ? ` ${n}` : "";
  const verb = c.resolved ? "Reopen" : "Resolve";
  return (
    <span className="flex flex-none items-center gap-1">
      {mine && onEdit && <IconBtn size="sm" label={`Edit note${which}`} onClick={onEdit}><Pencil aria-hidden /></IconBtn>}
      {(mine || ws.can("del")) && (
        <IconBtn size="sm" label={`Delete note${which}`} disabled={pending} className="hover:text-danger"
          onClick={() => { if (window.confirm(n ? `Delete note ${n}?` : "Delete this note?")) void run(deleteComment, c.id); }}>
          <Trash2 aria-hidden />
        </IconBtn>
      )}
      <Btn size="sm" disabled={pending} aria-label={n ? `${verb} note ${n}` : undefined} onClick={() => void run(toggleResolve, c.id)}>
        {c.resolved ? <RotateCcw aria-hidden size={14} /> : <Check aria-hidden size={14} />}{verb}
      </Btn>
    </span>
  );
}

/** Editing a note in place: its own text box, Save and Cancel (Esc), ⌘↵ saves. */
export function NoteEditor({ c, label = "Edit note", onDone }: { c: Comment; label?: string; onDone: () => void }) {
  const [run, pending] = useAction();
  const [text, setText] = useState(c.text);
  const save = async () => { const r = await run(editComment, c.id, text); if (r.ok) onDone(); };
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label={label} className="field leading-[1.55]"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } if (e.key === "Escape") { e.stopPropagation(); onDone(); } }} autoFocus />
      <div className="mt-2 flex justify-end gap-2">
        <Btn size="sm" onClick={onDone}>Cancel</Btn>
        <Btn size="sm" variant="primary" disabled={pending || !text.trim()} onClick={save}>Save</Btn>
      </div>
    </div>
  );
}

function Note({ c }: { c: Comment }) {
  const { ws } = useApp();
  const [editing, setEditing] = useState(false);
  return (
    <div className={cx("rounded-xl border px-4 py-3", c.resolved ? "border-line bg-wash" : c.isChange ? "border-change/30 bg-change/5" : "border-line bg-surface")}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Avatar initials={ws.user(c.userId).initials} size={26} mono />
        <span className="text-body font-semibold">{ws.first(c.userId)}</span>
        {c.isChange && <span className="rounded-sm bg-change/10 px-1.5 py-0.5 text-small font-semibold text-change-ink">Change request</span>}
        {c.resolved && <span className="rounded-sm bg-chip px-1.5 py-0.5 text-small font-medium text-mute-2">Resolved</span>}
        {isPinned(c) && <PinChip c={c} />}
        <span className="flex-1" />
        <span className="text-small text-mute-2">{ws.ago(c.createdAt)}{c.editedAt ? " · edited" : ""}</span>
        {!editing && <NoteActions c={c} onEdit={() => setEditing(true)} />}
      </div>
      {editing ? <NoteEditor c={c} onDone={() => setEditing(false)} /> : <CommentText c={c} />}
    </div>
  );
}

/** "Pin on hero.png": a note pinned in the proof view. Opens the proof view on that pin. */
function PinChip({ c }: { c: PinnedComment }) {
  const { ws, openAsset } = useApp();
  const go = useContext(PinLink);
  const file = ws.asset(c.itemId)?.files.find((f) => f.key === c.fileKey);
  const n = pinsOn(ws.commentsOf("asset", c.itemId), c.fileKey).findIndex((x) => x.id === c.id) + 1;
  const name = file?.name ?? "a removed image";
  return (
    <button type="button" onClick={() => (go ? go(c) : openAsset(c.itemId, "proof"))} aria-label={`Note ${n} on ${name}. Open it in the proof view`}
      className="max-w-[220px] truncate rounded-sm bg-soft px-2 py-0.5 text-small font-semibold text-accent hover:underline">
      <MapPin aria-hidden size={13} className="mr-1 inline-block align-[-2px]" />on {name}
    </button>
  );
}

/** The notes on an offer or asset. Open ones show; resolved ones fold away behind "3 resolved". */
export function Thread({ kind, id }: { kind: "offer" | "asset"; id: string }) {
  const { ws } = useApp();
  const [showResolved, setShowResolved] = useState(false);
  const list = ws.commentsOf(kind, id);
  const open = list.filter((c) => !c.resolved);
  const resolved = list.filter((c) => c.resolved);
  const panel = useId();
  return (
    <div className="flex flex-col gap-2">
      {resolved.length > 0 && (
        <>
          <button type="button" aria-expanded={showResolved} aria-controls={panel} onClick={() => setShowResolved((v) => !v)}
            className="-ml-2 inline-flex h-8 items-center gap-1 self-start rounded-lg px-2 text-meta font-medium text-mute-2 transition-colors hover:bg-hover hover:text-ink">
            <ChevronRight aria-hidden size={15} className={cx("transition-transform duration-200 ease-snap", showResolved && "rotate-90")} />
            {resolved.length} resolved
          </button>
          <div id={panel} hidden={!showResolved} className="flex flex-col gap-2">
            {showResolved && resolved.map((c) => <Note key={c.id} c={c} />)}
          </div>
        </>
      )}
      {open.map((c) => <Note key={c.id} c={c} />)}
      {!list.length && (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-5 text-center text-body text-mute-2">
          {/* Only people who can write a note are asked to. */}
          {ws.can("comment") ? "No notes yet. Write down the thing you would otherwise say in a meeting." : "No notes yet."}
        </div>
      )}
      {ws.can("comment") && <Composer kind={kind} id={id} />}
    </div>
  );
}

function tokenAt(t: string) {
  const m = /([#@])([^#@\n]*)$/.exec(t);
  if (!m) return null;
  return { sign: m[1] as "#" | "@", q: (m[2] ?? "").toLowerCase(), start: m.index };
}

function Composer({ kind, id }: { kind: "offer" | "asset"; id: string }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);

  const tk = tokenAt(text);
  const rows = useMemo(() => {
    if (!tk) return [];
    if (tk.q.length > 40) return [];
    if (tk.sign === "#") {
      return ws.d.offers
        .filter((o) => !o.archived && o.id !== id && (!tk.q || o.name.toLowerCase().includes(tk.q)))
        .slice(0, 6)
        .map((o) => ({ id: o.id, label: o.name, sub: `${ws.brand(o.brandId)?.name} · ${o.serviceId ? ws.service(o.serviceId)?.name : "Standalone"}`, sign: "#" as const }));
    }
    return ws.d.users
      .filter((u) => !tk.q || u.name.toLowerCase().includes(tk.q))
      .slice(0, 6)
      .map((u) => ({ id: u.id, label: u.name, sub: u.role, sign: "@" as const }));
  }, [tk?.sign, tk?.q, ws, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (r: (typeof rows)[number]) => {
    if (!tk) return;
    setText(text.slice(0, tk.start) + r.sign + r.label + " ");
    if (r.sign === "#") setRefs((x) => [...x, r.id]); else setMentions((x) => [...x, r.id]);
    setSel(0);
    box.current?.focus();
  };

  const post = async () => {
    if (!text.trim()) return;
    const r = await run(postComment, kind, id, text, refs, mentions);
    if (r.ok) { setText(""); setRefs([]); setMentions([]); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (rows.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(rows.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(rows[Math.min(sel, rows.length - 1)]); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void post(); }
  };

  return (
    <div className="relative mt-1 rounded-xl border border-line bg-surface px-3.5 py-3 focus-within:border-accent">
      <textarea
        ref={box}
        rows={2}
        value={text}
        onChange={(e) => { setText(e.target.value); setSel(0); }}
        onKeyDown={onKey}
        placeholder="Add a note. Type # to tag an offer, @ to pull someone in"
        aria-label="Add a note"
        className="w-full resize-y border-0 bg-transparent text-body outline-none"
      />
      {rows.length > 0 && (
        <div className="absolute bottom-full left-2.5 right-2.5 z-20 mb-1.5 origin-bottom animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          <div className="px-2.5 pb-1 pt-1.5 text-small font-medium text-mute-2">{tk?.sign === "#" ? "Offers" : "People"}</div>
          {rows.map((r, i) => (
            <button key={r.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(r); }} className={cx("flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left", i === sel ? "bg-hover" : "hover:bg-hover")}>
              <span className="flex-none text-body font-semibold">{r.sign}{r.label}</span>
              <span className="min-w-0 flex-1 truncate text-meta text-mute-3">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2.5 border-t border-divider pt-2.5">
        <span className="flex-1 text-small text-mute-2">Everyone on the team sees this · ⌘↵ to post</span>
        <Btn variant="primary" onClick={post} disabled={pending || !text.trim()}>Post note</Btn>
      </div>
    </div>
  );
}
