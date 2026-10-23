"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, Pencil, Plus, RefreshCw, RotateCcw, Upload, X } from "lucide-react";
import type { Client, ClientFile, ClientVideo, FileRef } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { extOf, previewKind } from "@/lib/files";
import { linkEmbed, webUrl } from "@/lib/embeds";
import { linkAddressIssue } from "@/lib/link-health";
import { checkBatch } from "@/lib/upload-policy";
import { refOf } from "@/lib/client-files";
import { removeClientFile, removeClientVideo, restoreClientFileVersion, saveClientVideo } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Field, IconBtn, cx } from "@/components/ui";
import { FOCUS } from "@/components/polish";
import { Modal } from "@/components/modals/frame";
import { FileGlyph, LINK_BTN } from "@/components/features/files/parts";
import { FilePreview, LinkPreview } from "@/components/features/files/file-preview";

/*
 * A client's own files (contracts, briefs, decks) and video links (calls,
 * walkthroughs), on the client's page. Everyone who can see the client can
 * open, preview and download them; people who set up clients (`structure`)
 * add, replace and remove them, and the server checks that again.
 */

const meta = (f: FileRef) => [f.size, extOf(f.name)].filter(Boolean).join(" · ");

export function FilesAndVideos({ c }: { c: Client }) {
  const { ws } = useApp();
  const canEdit = ws.can("structure");
  const files = c.files ?? [];
  const videos = c.videos ?? [];
  const head = useId();
  return (
    <section aria-labelledby={head} className="mt-10">
      <h2 id={head} className="m-0 mb-3.5 text-lead font-semibold tracking-[-0.01em]">Files and videos</h2>
      {!files.length && !videos.length && !canEdit ? (
        <p className="m-0 rounded-xl border border-dashed border-line-strong px-5 py-4 text-body text-mute-2">No files or videos for {c.name} yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <Files c={c} files={files} canEdit={canEdit} />
          <Videos c={c} videos={videos} canEdit={canEdit} />
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- files */

function Files({ c, files, canEdit }: { c: Client; files: ClientFile[]; canEdit: boolean }) {
  const { ws, toast } = useApp();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const replaceFor = useRef<string | null>(null);
  const [busy, setBusy] = useState<null | "upload" | string>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<FileRef | null>(null);
  const head = useId();
  const canUpload = canEdit && ws.can("upload");
  const limits = ws.d.uploads.mine;

  const send = async (list: File[], replace?: ClientFile) => {
    if (!list.length) return;
    // The same rules the server applies, checked first so nobody waits for a big file to be refused.
    const problem = checkBatch(list.map((f) => ({ name: f.name, size: f.size })), limits);
    if (problem) { toast(problem, "error"); return; }
    setBusy(replace ? replace.id : "upload");
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("file", f));
      if (replace) fd.append("replace", replace.id);
      const res = await fetch(`/api/clients/${c.id}/files`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast(body.error ?? "Upload failed.", "error");
      else {
        toast(replace ? `Replaced ${replace.name}. The earlier file is kept under its earlier versions.` : `${list.length === 1 ? list[0].name : `${list.length} files`} added to ${c.name}`);
        router.refresh();
      }
    } catch {
      toast("Upload failed. Check your connection and try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const pick = (replace: ClientFile | null) => {
    const el = input.current;
    if (!el) return;
    replaceFor.current = replace?.id ?? null;
    el.multiple = !replace;
    el.click();
  };
  const picked = (el: HTMLInputElement) => {
    const list = Array.from(el.files ?? []);
    const id = replaceFor.current;
    replaceFor.current = null;
    el.value = "";
    el.multiple = true;
    const replace = id ? files.find((f) => f.id === id) : undefined;
    void send(replace ? list.slice(0, 1) : list, replace);
  };

  return (
    <div
      onDragOver={(e) => { if (canUpload && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
      onDrop={(e) => { if (!canUpload || !e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setDrag(false); void send(Array.from(e.dataTransfer.files)); }}
      className={cx("rounded-xl transition", drag && "outline-2 outline-offset-4 outline-accent outline-dashed")}
    >
      <h3 id={head} className="m-0 mb-2 text-small font-medium text-mute-2">Files{files.length > 0 && <span className="tabular-nums"> {files.length}</span>}</h3>
      {files.length > 0 ? (
        <ul aria-labelledby={head} className="m-0 list-none overflow-hidden rounded-xl border border-line bg-surface p-0">
          {files.map((f) => (
            <FileRow key={f.id} c={c} f={f} canEdit={canEdit} canUpload={canUpload} busy={busy} onReplace={() => pick(f)} onPreview={setPreview} />
          ))}
        </ul>
      ) : (
        !canUpload && <p className="m-0 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-body text-mute-2">No files yet.</p>
      )}
      {canUpload && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => picked(e.currentTarget)} />
          <button type="button" disabled={!!busy} onClick={() => pick(null)}
            className={cx("flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-3 text-meta font-medium text-ink-3 transition-colors hover:border-mute-2 disabled:opacity-60", FOCUS, files.length > 0 && "mt-2")}>
            <Upload aria-hidden size={15} className="text-mute-2" />
            {busy === "upload" ? "Uploading…" : busy ? "Replacing…" : files.length ? "Upload files, or drop them here" : "Upload contracts, briefs or decks, or drop them here"}
          </button>
        </>
      )}
      {canEdit && !canUpload && <p className="mt-2 text-small text-mute-2">Uploading is switched off for you, so you can remove files but not add them.</p>}
      {preview && (
        <Modal title={preview.name} width={880} onClose={() => setPreview(null)} label={`Preview of ${preview.name}`}>
          {/* Focus moves into the dialog, onto the preview, so Tab and Esc work from the start. */}
          <div data-autofocus tabIndex={-1} className="outline-none">
            <FilePreview file={preview} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function FileRow({ c, f, canEdit, canUpload, busy, onReplace, onPreview }: {
  c: Client; f: ClientFile; canEdit: boolean; canUpload: boolean; busy: string | null; onReplace: () => void; onPreview: (f: FileRef) => void;
}) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const [removing, setRemoving] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const earlierId = useId();
  const earlier = f.earlier ?? [];
  const showable = !!f.url && previewKind(f) !== "other";
  const remove = async () => {
    const r = await run(removeClientFile, c.id, f.id);
    setRemoving(false);
    if (r.ok) toast(`Removed ${f.name}. ${ws.can("del") ? "You can" : "An admin can"} restore it from the Recycle bin for 30 days.`);
  };
  const putBack = async (v: NonNullable<ClientFile["earlier"]>[number]) => {
    const r = await run(restoreClientFileVersion, c.id, f.id, v.key!);
    if (r.ok) toast(`Put back the earlier ${v.name}. The one it replaced is kept as an earlier version.`);
  };
  return (
    <li className="border-t border-divider px-3 py-2.5 first:border-t-0 sm:px-3.5" data-file={f.name}>
      <div className="flex items-center gap-3">
        <FileGlyph f={f} />
        <span className="min-w-0 flex-1">
          {showable ? (
            <button type="button" onClick={() => onPreview(refOf(f))} aria-label={`Preview ${f.name}`} title={`Preview ${f.name}`}
              className="block max-w-full truncate rounded-sm text-left text-body font-medium text-ink hover:underline">{f.name}</button>
          ) : (
            <span className="block truncate text-body font-medium text-ink">{f.name}</span>
          )}
          <span className="block truncate text-small tabular-nums text-mute-2" suppressHydrationWarning>
            {[meta(f), `added ${fmtDate(f.addedAt, { short: true })}`, f.uploadedBy ? `by ${ws.first(f.uploadedBy)}` : ""].filter(Boolean).join(" · ")}
          </span>
        </span>
        {f.url && (
          <a href={f.url} download={f.name} aria-label={`Download ${f.name}`} title={`Download ${f.name}`} className={cx(LINK_BTN, FOCUS)}>
            <Download aria-hidden size={14} /><span className="hidden sm:inline">Download</span>
          </a>
        )}
        {canUpload && (
          <Btn size="sm" aria-label={`Replace ${f.name}`} title={`Replace ${f.name} with a new file. This one is kept as an earlier version.`} disabled={!!busy} onClick={onReplace}>
            <RefreshCw aria-hidden size={14} className={cx(busy === f.id && "animate-spin motion-reduce:animate-none")} /><span className="hidden sm:inline">Replace</span>
          </Btn>
        )}
        {canEdit && (
          <IconBtn size="sm" label={`Remove ${f.name}`} aria-expanded={removing} disabled={pending} onClick={() => setRemoving((v) => !v)} className="hover:text-danger">
            <X aria-hidden />
          </IconBtn>
        )}
      </div>
      {removing && (
        <div role="group" aria-label={`Remove ${f.name}`} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRemoving(false); } }}
          className="ml-12 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-wash px-3 py-2.5">
          <p className="m-0 min-w-0 flex-1 basis-48 text-meta text-ink-3 text-pretty">
            Remove it from {c.name}? It goes to the Recycle bin for 30 days{earlier.length ? ", earlier versions too" : ""}, and an admin can put it back.
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="ghost" disabled={pending} onClick={() => setRemoving(false)}>Cancel</Btn>
            {/* It appears because the person just asked to remove this file, so focus goes straight to it. */}
            <Btn size="sm" variant="danger" autoFocus disabled={pending} onClick={() => void remove()}>{pending ? "Removing…" : "Remove"}</Btn>
          </span>
        </div>
      )}
      {earlier.length > 0 && (
        <div className="mt-1 pl-12">
          <button type="button" aria-expanded={showEarlier} aria-controls={earlierId} onClick={() => setShowEarlier((v) => !v)}
            aria-label={`${earlier.length === 1 ? "1 earlier version" : `${earlier.length} earlier versions`} of ${f.name}`}
            className="-ml-1.5 inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-small font-medium text-mute-2 transition-colors hover:bg-hover hover:text-ink">
            <ChevronRight aria-hidden size={14} className={cx("transition-transform duration-200 ease-snap", showEarlier && "rotate-90")} />
            {earlier.length === 1 ? "1 earlier version" : `${earlier.length} earlier versions`}
          </button>
          <ul id={earlierId} hidden={!showEarlier} aria-label={`Earlier versions of ${f.name}`} className="m-0 mt-1 list-none p-0">
            {earlier.map((v) => (
              <li key={v.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider py-1.5 first:border-t-0">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-meta text-ink-3">{v.name}</span>
                  <span className="block text-small text-mute-2" suppressHydrationWarning>{[meta(v), `replaced ${fmtDate(v.replacedAt, { short: true })}`, v.replacedBy ? `by ${ws.first(v.replacedBy)}` : ""].filter(Boolean).join(" · ")}</span>
                </span>
                {v.url && <a href={v.url} download={v.name} aria-label={`Download the earlier ${v.name}`} className={cx(LINK_BTN, FOCUS)}><Download aria-hidden size={14} />Download</a>}
                {canEdit && v.key && <Btn size="sm" disabled={pending} aria-label={`Put back the earlier ${v.name}`} onClick={() => void putBack(v)}><RotateCcw aria-hidden size={14} />Put back</Btn>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- videos */

function Videos({ c, videos, canEdit }: { c: Client; videos: ClientVideo[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const head = useId();
  return (
    <div>
      <h3 id={head} className="m-0 mb-2 text-small font-medium text-mute-2">Videos{videos.length > 0 && <span className="tabular-nums"> {videos.length}</span>}</h3>
      {videos.length > 0 && (
        <ul aria-labelledby={head} className="m-0 grid list-none items-start gap-4 p-0 md:grid-cols-2">
          {videos.map((v) => <VideoRow key={v.id} c={c} v={v} canEdit={canEdit} />)}
        </ul>
      )}
      {!videos.length && !canEdit && <p className="m-0 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-body text-mute-2">No videos yet.</p>}
      {canEdit && (adding || !videos.length
        ? <VideoForm c={c} onDone={videos.length ? () => setAdding(false) : undefined} className={videos.length ? "mt-3" : undefined} />
        : <Btn size="sm" className="mt-3" onClick={() => setAdding(true)}><Plus aria-hidden size={15} />Add video link</Btn>)}
    </div>
  );
}

function VideoRow({ c, v, canEdit }: { c: Client; v: ClientVideo; canEdit: boolean }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  if (editing) return <li><VideoForm c={c} video={v} onDone={() => setEditing(false)} /></li>;
  const remove = async () => {
    const r = await run(removeClientVideo, c.id, v.id);
    if (r.ok) toast(`Removed the link to ${v.title}. The video itself is untouched.`);
    else setRemoving(false);
  };
  return (
    <li>
      <LinkPreview url={v.url} title={v.title} />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 flex-1 text-small text-mute-2" suppressHydrationWarning>Added {fmtDate(v.addedAt, { short: true })}{v.addedBy ? ` by ${ws.first(v.addedBy)}` : ""}</span>
        {canEdit && !removing && (
          <>
            <IconBtn size="sm" label={`Edit the link to ${v.title}`} onClick={() => setEditing(true)}><Pencil aria-hidden /></IconBtn>
            <IconBtn size="sm" label={`Remove the link to ${v.title}`} onClick={() => setRemoving(true)} className="hover:text-danger"><X aria-hidden /></IconBtn>
          </>
        )}
      </div>
      {removing && (
        <div role="group" aria-label={`Remove the link to ${v.title}`} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRemoving(false); } }}
          className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-wash px-3 py-2.5">
          <p className="m-0 min-w-0 flex-1 basis-48 text-meta text-ink-3 text-pretty">Remove this link from {c.name}? Only the link goes; the video stays where it is, so you can add it again.</p>
          <span className="flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="ghost" disabled={pending} onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn size="sm" variant="danger" autoFocus disabled={pending} onClick={() => void remove()}>{pending ? "Removing…" : "Remove"}</Btn>
          </span>
        </div>
      )}
    </li>
  );
}

/** What the link field says about an address as it is typed: a problem, or where it will play. */
function linkNote(raw: string): { error?: string; note?: string } {
  const t = raw.trim();
  if (!t) return {};
  const issue = linkAddressIssue(t);
  if (issue === "Two links in one address") return { error: "That is two links in one field. Add each video on its own." };
  if (issue) return { error: "There is a space in the link. Copy it again and paste it on its own." };
  const u = webUrl(t);
  if (!u) return { error: "Paste a full web address, for example youtube.com/watch?v=…" };
  const e = linkEmbed(u.href);
  return { note: e ? `${e.provider}: plays here once you press Load preview.` : "No player for this site. It shows as a link that opens in a new tab." };
}

function VideoForm({ c, video, onDone, className }: { c: Client; video?: ClientVideo; onDone?: () => void; className?: string }) {
  const { toast } = useApp();
  const [run, pending] = useAction();
  const [url, setUrl] = useState(video?.url ?? "");
  const [title, setTitle] = useState(video?.title ?? "");
  const [tried, setTried] = useState(false);
  const check = linkNote(url);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!url.trim() || check.error) return;
    const r = await run(saveClientVideo, c.id, { id: video?.id, title, url });
    if (!r.ok) return;
    toast(video ? "Video link saved" : `Video link added to ${c.name}`);
    setUrl(""); setTitle(""); setTried(false);
    onDone?.();
  };
  const error = check.error ?? (tried && !url.trim() ? "Paste the video's link first." : undefined);
  return (
    <form onSubmit={submit} aria-label={video ? `Edit ${video.title}` : "Add a video"} className={cx("max-w-[560px] rounded-xl border border-line bg-surface p-3.5 sm:p-4", className)}
      onKeyDown={(e) => { if (e.key === "Escape" && onDone) { e.stopPropagation(); onDone(); } }}>
      <div className="flex flex-col gap-3">
        <Field label="Video link" required error={error}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="field" inputMode="url" autoComplete="off" spellCheck={false}
            placeholder="youtube.com/watch?v=…, vimeo.com/…, loom.com/share/…" aria-invalid={!!error} autoFocus={!!onDone} />
          {!error && check.note && <span className="mt-1.5 block text-small text-mute-2">{check.note}</span>}
        </Field>
        <Field label="Title" hint={<span className="font-normal text-mute-3">Optional</span>}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="field" placeholder="Kick-off call, March" />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onDone && <Btn size="sm" variant="ghost" onClick={onDone}>Cancel</Btn>}
          <Btn size="sm" variant="primary" type="submit" disabled={pending}>{video ? "Save" : "Add video"}</Btn>
        </div>
      </div>
    </form>
  );
}
