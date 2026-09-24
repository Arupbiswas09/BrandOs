"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/db/schema";
import { href } from "@/lib/routes";
import { deleteComment, editComment, postComment, toggleResolve } from "@/app/actions";
import { useAction, useApp } from "./app/provider";
import { Avatar, Btn, cx } from "./ui";

type Seg = { text: string; chip?: "ref" | "at"; go?: () => void };

function useSegments() {
  const { ws } = useApp();
  const router = useRouter();
  return (c: Comment): Seg[] => {
    const marks: { find: string; kind: "ref" | "at"; go?: () => void }[] = [];
    c.refs.forEach((id) => { const o = ws.offer(id); if (o) marks.push({ find: "#" + o.name, kind: "ref", go: () => router.push(href.offer(id)) }); });
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
          if (i < bits.length - 1) out.push({ text: m.find, chip: m.kind, go: m.go });
        });
      }
      parts = out;
    }
    return parts;
  };
}

export function CommentText({ c }: { c: Comment }) {
  const segs = useSegments()(c);
  return (
    <div className="whitespace-pre-wrap text-[16px] leading-[1.6] text-ink-2 text-pretty">
      {segs.map((s, i) =>
        s.chip ? (
          <span
            key={i}
            onClick={s.go}
            role={s.go ? "link" : undefined}
            className={cx("mx-px inline rounded-[5px] px-1.5 py-px text-[15px] font-semibold", s.chip === "ref" ? "cursor-pointer bg-soft text-accent hover:underline" : "bg-avatar text-ink-3")}
          >
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </div>
  );
}

function Note({ c }: { c: Comment }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const mine = c.userId === ws.me.id;
  const save = async () => { const r = await run(editComment, c.id, text); if (r.ok) setEditing(false); };
  return (
    <div
      className="rounded-xl border px-4 py-3.5"
      style={{
        opacity: c.resolved ? 0.65 : 1,
        background: c.resolved ? "#F8FAFC" : c.isChange ? "rgba(194,65,18,.06)" : "#FFFFFF",
        borderColor: c.resolved ? "var(--bos-border)" : c.isChange ? "rgba(194,65,18,.28)" : "var(--bos-border)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-[9px] gap-y-1">
        <Avatar initials={ws.user(c.userId).initials} size={26} mono />
        <span className="text-[15px] font-semibold">{ws.first(c.userId)}</span>
        {c.isChange && <span className="eyebrow rounded bg-[rgba(194,65,18,.10)] px-[7px] py-[3px] text-change-ink">Change request</span>}
        <span className="flex-1" />
        <span className="font-mono text-[12.5px] text-mute-4">{ws.ago(c.createdAt)}{c.editedAt ? " · edited" : ""}</span>
        {mine && !editing && <button type="button" onClick={() => { setText(c.text); setEditing(true); }} className="px-1 py-0.5 text-[13px] text-mute-3 hover:text-ink">Edit</button>}
        {(mine || ws.can("del")) && !editing && (
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("Delete this note?")) void run(deleteComment, c.id); }} className="px-1 py-0.5 text-[13px] text-mute-3 hover:text-danger">Delete</button>
        )}
        {ws.can("comment") && !editing && (
          <button type="button" onClick={() => run(toggleResolve, c.id)} className="px-1 py-0.5 text-[13px] text-mute-3 hover:text-ink">{c.resolved ? "Reopen" : "Resolve"}</button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Edit note" className="field leading-[1.55]"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }} autoFocus />
          <div className="mt-2 flex justify-end gap-2">
            <Btn size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
            <Btn size="sm" variant="primary" disabled={pending || !text.trim()} onClick={save}>Save</Btn>
          </div>
        </div>
      ) : (
        <CommentText c={c} />
      )}
    </div>
  );
}

export function Thread({ kind, id }: { kind: "offer" | "asset"; id: string }) {
  const { ws } = useApp();
  const list = ws.commentsOf(kind, id);
  return (
    <div className="flex flex-col gap-[9px]">
      {list.map((c) => <Note key={c.id} c={c} />)}
      {!list.length && (
        <div className="rounded-xl border border-dashed border-line-strong p-[26px] text-center text-[15px] text-mute-2">No notes yet. Write down the thing you would otherwise say in a meeting.</div>
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
    <div className="relative mt-1 rounded-xl border border-line bg-white px-3.5 py-3">
      <textarea
        ref={box}
        rows={2}
        value={text}
        onChange={(e) => { setText(e.target.value); setSel(0); }}
        onKeyDown={onKey}
        placeholder="Add a note. Type # to tag an offer, @ to pull someone in"
        aria-label="Add a note"
        className="w-full resize-y border-0 bg-transparent text-[16px] leading-[1.55] outline-none"
      />
      {rows.length > 0 && (
        <div className="absolute bottom-full left-2.5 right-2.5 z-20 mb-1.5 animate-pop rounded-[11px] border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(16,22,20,.16)]">
          <div className="eyebrow px-2.5 pb-1 pt-1.5 text-[12px]">{tk?.sign === "#" ? "Offers" : "People"}</div>
          {rows.map((r, i) => (
            <button key={r.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(r); }} className={cx("flex w-full items-baseline gap-[9px] rounded-lg px-2.5 py-[7px] text-left", i === sel ? "bg-hover" : "hover:bg-hover")}>
              <span className="flex-none text-[15px] font-semibold">{r.sign}{r.label}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-mute-3">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2.5 border-t border-divider pt-2.5">
        <span className="flex-1 text-[14px] text-[#526077]">Everyone on the team sees this · ⌘↵ to post</span>
        <Btn variant="primary" onClick={post} disabled={pending || !text.trim()}>Post note</Btn>
      </div>
    </div>
  );
}
