"use client";

import { useContext, useEffect, useEffectEvent, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Loader2, MapPin, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { Comment, FileRef } from "@/db/schema";
import { href } from "@/lib/routes";
import { checkBatch } from "@/lib/upload-policy";
import { MAX_NOTE_IMAGES, NOTE_IMAGE_ACCEPT, NOTE_IMAGE_HINT, isNoteImage, mayAddNoteImages, picturesLabel } from "@/lib/note-images";
import { deleteComment, editComment, postComment, toggleResolve, type NoteImageInput } from "@/app/actions";
import { useAction, useApp } from "./app/provider";
import { Avatar, Btn, IconBtn, cx } from "./ui";
import { FOCUS } from "./polish";
import { LINK_BTN } from "./features/files/parts";
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
  // A note that is only pictures says so where its words would be (inbox, mentions), so the row is never blank.
  if (!c.text.trim() && plain && c.images?.length) return <span className="block text-body text-mute-2">{picturesLabel(c.images)}</span>;
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
  // A deleted note waits in the recycle bin, pictures and all.
  const ask = `${n ? `Delete note ${n}?` : "Delete this note?"} ${ws.can("del") ? "You can" : "An admin can"} restore it from the Recycle bin for 30 days.`;
  return (
    <span className="flex flex-none items-center gap-1">
      {mine && onEdit && <IconBtn size="sm" label={`Edit note${which}`} onClick={onEdit}><Pencil aria-hidden /></IconBtn>}
      {(mine || ws.can("del")) && (
        <IconBtn size="sm" label={`Delete note${which}`} disabled={pending} className="hover:text-danger"
          onClick={() => { if (window.confirm(ask)) void run(deleteComment, c.id); }}>
          <Trash2 aria-hidden />
        </IconBtn>
      )}
      <Btn size="sm" disabled={pending} aria-label={n ? `${verb} note ${n}` : undefined} onClick={() => void run(toggleResolve, c.id)}>
        {c.resolved ? <RotateCcw aria-hidden size={14} /> : <Check aria-hidden size={14} />}{verb}
      </Btn>
    </span>
  );
}

/* ---------------------------------------------------------------- pictures in notes */

/** A picture in the note box: one already on the note (`ref`), or one picked, pasted or dropped and not yet stored (`file`). */
type Pic = { id: string; name: string; src: string; file?: File; ref?: FileRef };

/** "Pasted picture 2026-10-23 14.30.05.png" → "Pasted picture 2026-10-23 14.30.05", for alt text. */
const altOf = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, "") || "Picture";

/** Clipboard pictures arrive called "image.png"; one named for when it was pasted reads better as alt text and once downloaded. */
function named(f: File): File {
  if (f.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) return f;
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[f.type];
  if (!ext) return f;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return new File([f], `Pasted picture ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.${ext}`, { type: f.type });
}

/** Image files on the clipboard, wherever the browser put them. */
function clipboardImages(data: DataTransfer): File[] {
  const files = Array.from(data.files ?? []);
  const list = files.length ? files : Array.from(data.items ?? []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
  return list.filter((f) => f.type.startsWith("image/"));
}

/**
 * Pictures for one note box (a new note, or a note being edited): pasted
 * (⌘V), dropped or picked with Add image. They show as thumbnails with a
 * remove button and are only stored when the note is posted or saved.
 */
function usePictures(kind: "offer" | "asset", itemId: string, initial: FileRef[] = []) {
  const { ws, toast } = useApp();
  const allowed = mayAddNoteImages(ws.me);
  const [list, setList] = useState<Pic[]>(() => initial.filter((f) => f.url).map((f) => ({ id: f.key ?? f.name, name: f.name, src: `${f.url}?inline=1`, ref: f })));
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const local = useRef(new Set<string>());
  useEffect(() => {
    const urls = local.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const add = (files: File[]) => {
    if (!allowed || !files.length) return;
    const fresh = files.map(named).filter((f) => isNoteImage(f));
    const room = MAX_NOTE_IMAGES - list.length;
    if (fresh.length < files.length) toast(`Notes take pictures only: ${NOTE_IMAGE_HINT}.`, "error");
    else if (fresh.length > room) toast(room > 0 ? `A note holds up to ${MAX_NOTE_IMAGES} pictures, so only the first ${room} went in.` : `A note holds up to ${MAX_NOTE_IMAGES} pictures.`, "error");
    const take = fresh.slice(0, Math.max(0, room));
    if (!take.length) return;
    // The same size limits the server applies, checked first so nobody waits to be refused.
    const problem = checkBatch(take.map((f) => ({ name: f.name, size: f.size })), ws.d.uploads.mine);
    if (problem) { toast(problem, "error"); return; }
    const next = take.map((file) => {
      const src = URL.createObjectURL(file);
      local.current.add(src);
      return { id: crypto.randomUUID(), name: file.name, src, file };
    });
    setList((cur) => [...cur, ...next].slice(0, MAX_NOTE_IMAGES));
  };

  const forget = (p: Pic) => {
    if (p.file && local.current.has(p.src)) { URL.revokeObjectURL(p.src); local.current.delete(p.src); }
  };
  const remove = (id: string) => {
    const gone = list.find((p) => p.id === id);
    if (gone) forget(gone);
    setList((cur) => cur.filter((p) => p.id !== id));
  };
  const reset = () => { list.forEach(forget); setList([]); };

  /**
   * Stores the pictures not stored yet and gives back the whole list the note
   * should hold, or null when the upload failed (the toast says why). Stored
   * ones are remembered, so trying again does not send them twice.
   */
  const upload = async (): Promise<NoteImageInput[] | null> => {
    const todo = list.filter((p) => !p.ref && p.file);
    let done = list;
    if (todo.length) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("kind", kind);
        fd.append("itemId", itemId);
        todo.forEach((p) => fd.append("file", p.file!));
        const res = await fetch("/api/notes/images", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(body.files)) { toast(body.error ?? "The pictures did not upload. Try again.", "error"); return null; }
        const refs = body.files as FileRef[];
        const byId = new Map(todo.map((p, i) => [p.id, refs[i]]));
        done = list.map((p) => (byId.get(p.id) ? { ...p, ref: byId.get(p.id) } : p));
        setList(done);
      } catch {
        toast("The pictures did not upload. Check your connection and try again.", "error");
        return null;
      } finally {
        setUploading(false);
      }
    }
    return done.filter((p) => p.ref?.key).map((p) => ({ key: p.ref!.key!, name: p.ref!.name }));
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!allowed) return;
    const files = clipboardImages(e.clipboardData);
    // A copied spreadsheet range or document carries a picture of itself as well as its text: that pastes as text.
    if (!files.length || e.clipboardData.types.includes("text/plain")) return;
    e.preventDefault();
    add(files);
  };

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const drop = allowed ? {
    onDragOver: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); setOver(false); add(Array.from(e.dataTransfer.files)); },
  } : {};

  const picker = allowed ? (
    <input ref={input} type="file" accept={NOTE_IMAGE_ACCEPT} multiple hidden aria-hidden tabIndex={-1}
      onChange={(e) => { const el = e.currentTarget; add(Array.from(el.files ?? [])); el.value = ""; }} />
  ) : null;
  const button = allowed ? (
    <Btn size="sm" disabled={uploading || list.length >= MAX_NOTE_IMAGES}
      title={`Add pictures: ${NOTE_IMAGE_HINT}, up to ${MAX_NOTE_IMAGES}. You can also paste or drop them into the note.`}
      onClick={() => input.current?.click()}>
      <ImagePlus aria-hidden size={15} />Add image
    </Btn>
  ) : null;

  return { allowed, list, uploading, over, add, remove, reset, upload, onPaste, drop, picker, button };
}

/** The pictures waiting in a note box, each with a remove button. */
function PictureStrip({ pics }: { pics: ReturnType<typeof usePictures> }) {
  if (!pics.list.length) return null;
  return (
    <>
    <ul aria-label={`Pictures in this note (${pics.list.length} of ${MAX_NOTE_IMAGES})`} className="m-0 mt-2 flex list-none flex-wrap gap-2.5 p-0 pt-1.5">
      {pics.list.map((p) => (
        <li key={p.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or a private, auth-checked file */}
          <img src={p.src} alt={altOf(p.name)} className="block size-16 rounded-lg border border-line bg-wash object-cover" />
          {pics.uploading && !p.ref && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface/75">
              <Loader2 aria-hidden size={16} className="animate-spin text-ink-3 motion-reduce:animate-none" />
            </span>
          )}
          <button type="button" aria-label={`Remove ${p.name}`} title={`Remove ${p.name}`} disabled={pics.uploading} onClick={() => pics.remove(p.id)}
            className={cx("absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-card transition-colors hover:text-danger disabled:opacity-50", FOCUS)}>
            <X aria-hidden size={13} strokeWidth={2.2} />
          </button>
        </li>
      ))}
    </ul>
    <span role="status" className="sr-only">{pics.uploading ? "Uploading pictures" : ""}</span>
    </>
  );
}

/** Shown over a note box while pictures are held over it. */
function DropVeil({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/85 text-meta font-medium text-accent">
      Drop to add pictures
    </span>
  );
}

/** The pictures on a posted note. Each opens large in the viewer. */
export function NoteImages({ c, className }: { c: Pick<Comment, "images">; className?: string }) {
  const list = (c.images ?? []).filter((f) => f.url);
  const [open, setOpen] = useState<{ at: number; animate: boolean } | null>(null);
  if (!list.length) return null;
  const one = list.length === 1;
  return (
    <>
      <ul aria-label={picturesLabel(list)} className={cx("m-0 flex list-none flex-wrap gap-2 p-0", className)}>
        {list.map((f, i) => (
          <li key={f.key ?? i}>
            {/* A click from the keyboard (Enter or Space) has detail 0: open at once, no motion. */}
            <button type="button" onClick={(e: ReactMouseEvent) => setOpen({ at: i, animate: e.detail > 0 })} aria-label={`Open ${altOf(f.name)} large`} title={f.name}
              className={cx("block cursor-zoom-in overflow-hidden rounded-lg border border-line bg-wash transition-colors hover:border-line-strong", FOCUS)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file served by /api/files */}
              <img src={`${f.url}?inline=1`} alt={altOf(f.name)} loading="lazy" decoding="async"
                className={cx("block object-cover", one ? "h-40 w-64 max-w-full sm:h-48 sm:w-80" : "h-24 w-32 sm:h-28 sm:w-40")} />
            </button>
          </li>
        ))}
      </ul>
      {open && <PictureViewer list={list} at={open.at} animate={open.animate} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * A note's pictures at full size over everything. Arrow keys or the buttons
 * go between them; Esc, Close or a click outside the picture closes it, and
 * only it: the drawer or page behind stays as it was.
 */
function PictureViewer({ list, at, animate, onClose }: { list: FileRef[]; at: number; animate: boolean; onClose: () => void }) {
  const [i, setI] = useState(Math.min(at, list.length - 1));
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const f = list[i];
  const many = list.length > 1;
  const go = (d: number) => setI((x) => (x + d + list.length) % list.length);
  const keys = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (many && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); e.stopPropagation(); go(e.key === "ArrowRight" ? 1 : -1); return; }
    if (e.key !== "Tab") return;
    // Focus stays on the viewer's own controls.
    const nodes = Array.from(box.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    const now = document.activeElement as HTMLElement | null;
    const inside = !!now && nodes.includes(now);
    if (e.shiftKey && (now === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (now === last || !inside)) { e.preventDefault(); first.focus(); }
  });
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const on = (e: KeyboardEvent) => keys(e);
    window.addEventListener("keydown", on, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", on, true); document.body.style.overflow = overflow; back?.focus?.(); };
  }, []);
  if (!f) return null;
  const src = `${f.url}?inline=1`;
  const onDark = "bg-surface text-ink hover:bg-surface hover:text-ink";
  return createPortal(
    <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cx("fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 bg-ink/95 p-4 sm:p-8", animate && "animate-fade")}>
      <div className="absolute right-3 top-3 flex items-center gap-2 sm:right-4 sm:top-4">
        <a href={src} target="_blank" rel="noopener noreferrer" className={cx(LINK_BTN, FOCUS)}><ExternalLink aria-hidden size={14} />Open in new tab</a>
        <IconBtn ref={closeBtn} label="Close" onClick={onClose} className={onDark}><X /></IconBtn>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file */}
      <img key={f.key ?? i} src={src} alt={altOf(f.name)} className="max-h-[calc(100dvh-136px)] max-w-full rounded-sm object-contain" />
      <div className="flex max-w-full items-center gap-3">
        {many && <IconBtn label="Previous picture" onClick={() => go(-1)} className={onDark}><ChevronLeft /></IconBtn>}
        <p id={titleId} className="m-0 min-w-0 truncate text-meta text-surface">{f.name}{many ? ` · ${i + 1} of ${list.length}` : ""}</p>
        {many && <IconBtn label="Next picture" onClick={() => go(1)} className={onDark}><ChevronRight /></IconBtn>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- notes */

/** Editing a note in place: its own text box and pictures, Save and Cancel (Esc), ⌘↵ saves. */
export function NoteEditor({ c, label = "Edit note", onDone }: { c: Comment; label?: string; onDone: () => void }) {
  const [run, pending] = useAction();
  const [text, setText] = useState(c.text);
  const pics = usePictures(c.kind, c.itemId, c.images ?? []);
  const empty = !text.trim() && !pics.list.length;
  const save = async () => {
    if (empty || pics.uploading) return;
    const images = await pics.upload();
    if (!images) return;
    const had = (c.images ?? []).map((f) => f.key).join("|");
    const r = await run(editComment, c.id, text, images.map((x) => x.key).join("|") === had ? undefined : images);
    if (r.ok) onDone();
  };
  return (
    <div {...pics.drop} className="relative">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onPaste={pics.onPaste} rows={3} aria-label={label} className="field leading-[1.55]"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } if (e.key === "Escape") { e.stopPropagation(); onDone(); } }} autoFocus />
      <PictureStrip pics={pics} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {pics.button}
        {pics.picker}
        <span className="flex-1" />
        <Btn size="sm" onClick={onDone}>Cancel</Btn>
        <Btn size="sm" variant="primary" disabled={pending || pics.uploading || empty} onClick={save}>{pics.uploading ? "Uploading…" : "Save"}</Btn>
      </div>
      <DropVeil show={pics.over} />
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
      {editing ? <NoteEditor c={c} onDone={() => setEditing(false)} /> : (
        <>
          {c.text.trim() && <CommentText c={c} />}
          <NoteImages c={c} className={c.text.trim() ? "mt-2.5" : undefined} />
        </>
      )}
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
  const pics = usePictures(kind, id);
  const empty = !text.trim() && !pics.list.length;

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
    if (empty || pics.uploading || pending) return;
    const images = await pics.upload();
    if (!images) return;
    const r = await run(postComment, kind, id, text, refs, mentions, null, images);
    if (r.ok) { setText(""); setRefs([]); setMentions([]); pics.reset(); }
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
    <div {...pics.drop} className={cx("relative mt-1 rounded-xl border border-line bg-surface px-3.5 py-3 focus-within:border-accent", pics.over && "border-accent")}>
      <textarea
        ref={box}
        rows={2}
        value={text}
        onChange={(e) => { setText(e.target.value); setSel(0); }}
        onKeyDown={onKey}
        onPaste={pics.onPaste}
        placeholder="Add a note. Type # to tag an offer, @ to pull someone in"
        aria-label="Add a note"
        className="w-full resize-y border-0 bg-transparent text-body outline-none"
      />
      <PictureStrip pics={pics} />
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
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-divider pt-2.5">
        {pics.button}
        {pics.picker}
        {/* On a phone the hint has its own line, so Add image and Post note share one. */}
        <span className="order-first w-full text-small text-mute-2 sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">Everyone on the team sees this<span className="hidden sm:inline"> · ⌘↵ to post</span></span>
        <Btn variant="primary" className="ml-auto" onClick={post} disabled={pending || pics.uploading || empty}>{pics.uploading ? "Uploading…" : "Post note"}</Btn>
      </div>
      <DropVeil show={pics.over} />
    </div>
  );
}
