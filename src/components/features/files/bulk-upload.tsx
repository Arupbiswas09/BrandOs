"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload, X } from "lucide-react";
import { AUTO_TYPE, INLINE_IMAGE, bulkTypeOptions, tidyName, typeForFile } from "@/lib/files";
import { FILE_KINDS, checkBatch, kindOf, sizeLabel, type MyUploadLimits } from "@/lib/upload-policy";
import { useApp } from "@/components/app/provider";
import { Btn, IconBtn, Select, cx } from "@/components/ui";
import { capturePoster, filesFromDrop } from "./drop";
import { FileGlyph } from "./parts";

/*
 * "Drop 30 ad creatives into an offer and get 30 assets": every file becomes
 * its own draft asset, named after the file, owned by whoever adds it, and
 * linked to the offer (and folder) this sits in. Pictures are their own
 * thumbnail; a video gets a still from about a second in, taken here in the
 * browser. The server checks everything again (src/app/api/bulk-assets).
 */

type Status = "queued" | "sending" | "saving" | "done" | "failed";
type Item = {
  id: string;
  file: File;
  name: string;
  /** A local picture of an image, until it is sent. */
  preview: string | null;
  /** Why this file cannot go up at all (type or size), checked as it is added. */
  problem: string | null;
  status: Status;
  /** 0 to 1, while sending. */
  progress: number;
  error?: string;
  assetId?: string;
};

/** More than this in one go is almost certainly the wrong folder. */
const MAX_QUEUE = 200;

/** checkBatch names the file; under the file's own row that reads twice. */
function plainProblem(name: string, msg: string) {
  if (msg.startsWith(`${name}: `)) { const r = msg.slice(name.length + 2); return r.charAt(0).toUpperCase() + r.slice(1); }
  if (msg.startsWith(`${name} is `)) return `This file is ${msg.slice(name.length + 4)}`;
  return msg;
}

function problemOf(f: File, limits: MyUploadLimits): string | null {
  if (!kindOf(f.name)) return "BrandOS does not take this kind of file. Images, PDFs, Office documents, fonts, zip files, video, audio and text go up.";
  const p = checkBatch([{ name: f.name, size: f.size }], { ...limits, maxFiles: Number.POSITIVE_INFINITY, remainingBytes: null });
  return p ? plainProblem(f.name, p) : null;
}

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
const isVideo = (f: File) => f.type.startsWith("video/") || kindOf(f.name) === "video";

type Sent = { ok: true; ids: string[] } | { ok: false; error: string };

/** Row ids, unique for the page's life. */
let rowSeq = 0;

export function BulkUpload({ brandId, offerId, folderId, initialFiles, onDone, onClose, className }: {
  /** The brand the new assets belong to; null for the Global Library. */
  brandId: string | null;
  /** Link every new asset to this offer. */
  offerId?: string | null;
  /** On an offer page, the folder the files were dropped into. */
  folderId?: string | null;
  /**
   * Files already dropped somewhere else (say, on the offer's asset grid), listed
   * straight away. Read a page-level drop with `filesFromDrop` from ./drop so folders open too.
   */
  initialFiles?: File[];
  /** Called with the new assets' ids once everything has gone up. */
  onDone?: (ids: string[]) => void;
  /** Shows a Close button when done (in a panel or dialog). */
  onClose?: () => void;
  className?: string;
}) {
  const { ws, openAsset } = useApp();
  const router = useRouter();
  const limits = ws.d.uploads.mine;
  const inLibrary = !brandId;
  const offer = offerId ? ws.offer(offerId) : null;
  const folder = folderId ? ws.d.folders.find((f) => f.id === folderId) ?? null : null;
  const brand = ws.brand(brandId);
  const allowed = ws.can("edit") && ws.can("upload") && (brandId ? !!brand : ws.can("library")) && (!offer || ws.canChange(offer));

  const urls = useRef(new Set<string>());
  /** Files as rows: a local picture for images, and any reason it cannot go up. */
  const toItems = (files: File[]) => files.map((file): Item => ({
    id: `f${++rowSeq}`, file, name: tidyName(file.name), preview: INLINE_IMAGE.test(file.type) ? URL.createObjectURL(file) : null,
    problem: problemOf(file, limits), status: "queued", progress: 0,
  }));
  const [items, setItems] = useState<Item[]>(() => toItems((initialFiles ?? []).slice(0, MAX_QUEUE)));
  // Every local picture made is remembered, so it can be let go when its row or the panel goes.
  useEffect(() => { items.forEach((i) => { if (i.preview) urls.current.add(i.preview); }); }, [items]);
  const [type, setType] = useState(AUTO_TYPE);
  const [phase, setPhase] = useState<"pick" | "sending" | "posters" | "done">("pick");
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Assets made so far in this panel, so later requests join the same activity line. */
  const made = useRef<string[]>([]);
  const headId = useId();
  const typeId = useId();

  // Local pictures are let go when the panel goes.
  useEffect(() => {
    const live = urls.current;
    return () => { live.forEach((u) => URL.revokeObjectURL(u)); live.clear(); };
  }, []);

  const busy = phase === "sending" || phase === "posters";
  // Leaving mid-upload would drop the files still on their way, so the browser asks first.
  useEffect(() => {
    if (!busy) return;
    const hold = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [busy]);
  const where = offer
    ? folder ? `the ${folder.name} folder of ${offer.name}` : offer.name
    : brand ? `${brand.name}'s assets` : "the Global Library";

  const add = (list: File[]) => {
    if (busy || !list.length) return;
    // After a finished drop, new files start a new list.
    const base = phase === "done" ? [] : items;
    if (phase === "done") reset();
    const fresh = list.filter((f) => !base.some((x) => sameFile(x.file, f)));
    const room = Math.max(0, MAX_QUEUE - base.length);
    setNote(fresh.length > room ? `Add up to ${MAX_QUEUE} files at once. The first ${room} of these were added.` : null);
    const next = toItems(fresh.slice(0, room));
    setItems((prev) => [...(phase === "done" ? [] : prev), ...next]);
  };

  const drop = (it: Item) => {
    if (it.preview) { URL.revokeObjectURL(it.preview); urls.current.delete(it.preview); }
    setItems((prev) => prev.filter((x) => x.id !== it.id));
  };

  function reset() {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    made.current = [];
    setItems([]);
    setNote(null);
    setPhase("pick");
  }

  const patch = (ids: Set<string>, fn: (it: Item) => Partial<Item>) =>
    setItems((prev) => prev.map((it) => (ids.has(it.id) ? { ...it, ...fn(it) } : it)));

  /** One request. Progress is shared out over the files in the order they are sent. */
  const send = (batch: Item[], continues: boolean) => new Promise<Sent>((resolve) => {
    const fd = new FormData();
    fd.append("brandId", brandId ?? "");
    if (offerId) fd.append("offerId", offerId);
    if (folderId) fd.append("folderId", folderId);
    fd.append("type", type);
    if (continues) fd.append("continues", "1");
    for (const it of batch) { fd.append("files", it.file); fd.append("names", it.name.trim()); }
    const sizes = batch.map((b) => b.file.size);
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    const ids = new Set(batch.map((b) => b.id));
    const x = new XMLHttpRequest();
    x.open("POST", "/api/bulk-assets");
    x.upload.onprogress = (e) => {
      if (!e.lengthComputable || !e.total) return;
      const sent = (e.loaded / e.total) * sum;
      const share = new Map<string, number>();
      let at = 0;
      batch.forEach((b, i) => { share.set(b.id, Math.max(0, Math.min(1, (sent - at) / (sizes[i] || 1)))); at += sizes[i]; });
      patch(ids, (it) => { const p = share.get(it.id) ?? 0; return { progress: p, status: p >= 1 ? "saving" : "sending" }; });
    };
    x.upload.onload = () => patch(ids, () => ({ progress: 1, status: "saving" }));
    x.onload = () => {
      let body: { ok?: boolean; ids?: string[]; error?: string } = {};
      try { body = JSON.parse(x.responseText); } catch { /* not JSON: a proxy or server error page */ }
      if (x.status >= 200 && x.status < 300 && body.ok && body.ids?.length === batch.length) resolve({ ok: true, ids: body.ids });
      else resolve({ ok: false, error: body.error ?? "These did not go up. Try again in a moment." });
    };
    x.onerror = () => resolve({ ok: false, error: "These did not go up. Check your connection and try again." });
    x.send(fd);
  });

  const ready = items.filter((i) => !i.problem && i.status !== "done");
  const bytes = ready.reduce((n, i) => n + i.file.size, 0);
  const room = ready.length && limits.remainingBytes != null && bytes > limits.remainingBytes
    ? checkBatch(ready.map((i) => ({ name: i.file.name, size: i.file.size })), { ...limits, maxFiles: Number.POSITIVE_INFINITY })
    : null;
  const skipped = items.filter((i) => i.problem).length;
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "failed");
  const sendingNow = items.filter((i) => i.status === "sending" || i.status === "saving").length;

  const start = async () => {
    if (busy || !ready.length || room || !allowed) return;
    setPhase("sending");
    setNote(null);
    // The server takes as many files per request as Team and access → Limits allows; bigger drops go in turns.
    const per = Math.max(1, Math.min(limits.maxFiles, 50));
    const videos: { assetId: string; file: File }[] = [];
    for (let i = 0; i < ready.length; i += per) {
      const batch = ready.slice(i, i + per);
      const ids = new Set(batch.map((b) => b.id));
      patch(ids, () => ({ status: "sending", progress: 0, error: undefined }));
      const r = await send(batch, made.current.length > 0);
      if (r.ok) {
        made.current.push(...r.ids);
        const byItem = new Map(batch.map((b, k) => [b.id, r.ids[k]]));
        patch(ids, (it) => ({ status: "done", progress: 1, assetId: byItem.get(it.id) }));
        batch.forEach((b, k) => { if (isVideo(b.file)) videos.push({ assetId: r.ids[k], file: b.file }); });
      } else {
        patch(ids, () => ({ status: "failed", progress: 0, error: r.error }));
      }
    }
    if (videos.length) {
      setPhase("posters");
      for (const v of videos) {
        const poster = await capturePoster(v.file);
        if (!poster) continue;
        const fd = new FormData();
        fd.append("file", poster);
        // A missing still is not worth an error: the card shows the video icon instead.
        await fetch(`/api/assets/${v.assetId}/thumbnail`, { method: "POST", body: fd }).catch(() => {});
      }
    }
    router.refresh();
    setPhase("done");
    if (made.current.length) onDone?.([...made.current]);
  };

  const onDragOver = (e: DragEvent) => {
    if (!allowed || busy || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!drag) setDrag(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!allowed || busy || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDrag(false);
    // Folder contents have to be asked for while the drop event is still running.
    void filesFromDrop(e.dataTransfer).then(add);
  };

  const typeOptions = [{ value: AUTO_TYPE, label: "Detect from file" }, ...bulkTypeOptions(inLibrary).map((t) => ({ value: t, label: t }))];
  const shownType = (f: File) => (type === AUTO_TYPE ? typeForFile(f, inLibrary) : type);
  const firstId = done[0]?.assetId;
  const on = FILE_KINDS.filter((k) => limits.kinds[k.kind].allowed);

  if (!allowed) {
    return (
      <section aria-labelledby={headId} className={cx("rounded-xl border border-line bg-surface px-4 py-4", className)}>
        <h2 id={headId} className="m-0 text-lead font-semibold text-ink">Add files as assets</h2>
        <p className="m-0 mt-1 text-body text-mute-2">
          {!ws.can("upload") || !ws.can("edit") ? "Uploading is switched off for you. Ask an admin if you need it." : inLibrary ? "Only managers and admins can add to the Global Library." : "Contributors can only add to offers they own. Ask its owner or an editor."}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={headId} onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }} onDrop={onDrop}
      className={cx("rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5", className)}>
      <div className="mb-4">
        <h2 id={headId} className="m-0 text-lead font-semibold text-ink">
          {phase === "done" && done.length ? `${done.length} asset${done.length === 1 ? "" : "s"} added` : "Add files as assets"}
        </h2>
        <p className="m-0 mt-1 text-body text-mute-2 text-pretty">
          {phase === "done" && done.length
            ? <>Each is a draft in {where}, owned by you{failed.length ? `. ${failed.length} file${failed.length === 1 ? "" : "s"} did not go up` : ""}.</>
            : <>Each file becomes its own draft asset in {where}, owned by you.</>}
        </p>
      </div>

      {phase !== "done" && (
        // Once files are listed the drop area steps back to one line, so the list leads.
        <div className={cx("flex items-center justify-center gap-3 rounded-xl border border-dashed transition-colors duration-150",
          items.length ? "flex-wrap px-3 py-2.5 sm:justify-start sm:px-3.5" : "flex-col px-4 py-6 text-center sm:py-8",
          drag ? "border-accent bg-soft" : "border-line-strong bg-wash")}>
          <Upload aria-hidden size={items.length ? 16 : 20} className={drag ? "text-accent" : "text-mute-2"} />
          <p className={cx("m-0 font-medium text-ink-3", items.length ? "text-meta" : "text-body")}>{drag ? "Drop to add them" : items.length ? "Drop more files or a folder here" : "Drop files or a folder here"}</p>
          <Btn size="sm" disabled={busy} onClick={() => input.current?.click()} className={cx(items.length > 0 && "sm:ml-auto")}>{items.length ? "Choose more" : "Choose files"}</Btn>
          <input ref={input} type="file" multiple hidden tabIndex={-1} onChange={(e) => { const list = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; add(list); }} />
          {!items.length && (
            <p className="m-0 max-w-[60ch] text-small text-mute-2 text-pretty">
              {on.map((k) => `${k.label} up to ${sizeLabel(limits.kinds[k.kind].maxBytes)}`).join(" · ")}.
              {limits.remainingBytes != null && <> {sizeLabel(limits.remainingBytes)} of storage left.</>}
            </p>
          )}
        </div>
      )}

      {note && <p role="status" className="m-0 mt-3 text-meta text-warn-text">{note}</p>}

      {items.length > 0 && (
        <ul aria-label="Files to add" className="m-0 mt-4 list-none overflow-hidden rounded-xl border border-line p-0">
          {items.map((it) => {
            const pct = Math.round(it.progress * 100);
            const status = it.problem ? null
              : it.status === "sending" ? `Uploading ${pct}%`
              : it.status === "saving" ? "Saving…"
              : it.status === "done" ? "Added"
              : null;
            return (
              <li key={it.id} className="flex items-start gap-3 border-t border-divider px-3 py-2.5 first:border-t-0 sm:px-3.5" data-status={it.problem ? "refused" : it.status}>
                <span className="pt-0.5"><FileGlyph f={{ name: it.file.name, type: it.file.type }} src={it.preview} size={40} /></span>
                <span className="min-w-0 flex-1">
                  {it.status === "done" || it.problem || busy ? (
                    <span className={cx("block truncate py-1 text-body font-medium", it.problem ? "text-mute-2" : "text-ink")}>{it.problem ? it.file.name : it.name}</span>
                  ) : (
                    <input value={it.name} maxLength={200} aria-label={`Asset name for ${it.file.name}`}
                      onChange={(e) => { const v = e.target.value; setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, name: v } : x))); }}
                      onBlur={(e) => { if (!e.target.value.trim()) setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, name: tidyName(x.file.name) } : x))); }}
                      className="field h-8 px-2.5 py-1 text-body" />
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-small text-mute-2">
                    {/* On a phone the file name gets its own line, so no line starts with a dot. */}
                    {!it.problem && <><span className="max-w-full basis-full truncate font-mono sm:basis-auto">{it.file.name}</span><span aria-hidden className="hidden sm:inline">·</span></>}
                    <span>{sizeLabel(it.file.size)}</span>
                    {!it.problem && <><span aria-hidden>·</span><span>{shownType(it.file)}</span></>}
                    {status && <><span aria-hidden>·</span><span className={cx(it.status === "done" && "inline-flex items-center gap-1 font-medium text-ok")}>{it.status === "done" && <Check aria-hidden size={13} />}{status}</span></>}
                  </span>
                  {(it.status === "sending" || it.status === "saving") && (
                    <span role="progressbar" aria-label={`Uploading ${it.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                      className="mt-1.5 block h-1 overflow-hidden rounded-full bg-chip">
                      <span className="block h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-snap" style={{ transform: `scaleX(${it.progress})` }} />
                    </span>
                  )}
                  {(it.problem || it.error) && <span className="mt-1 block text-small font-medium text-danger">{it.problem ?? it.error}</span>}
                </span>
                {it.status !== "done" && !busy && phase !== "done" && (
                  <IconBtn label={`Remove ${it.file.name}`} size="sm" onClick={() => drop(it)} className="mt-1"><X /></IconBtn>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {room && <p role="alert" className="m-0 mt-3 text-meta font-medium text-danger">{room}</p>}

      <p aria-live="polite" className="sr-only">
        {phase === "sending" ? `Uploading ${sendingNow} file${sendingNow === 1 ? "" : "s"}. ${done.length} added so far.` : phase === "posters" ? "Taking stills from the videos." : phase === "done" ? `${done.length} assets added.` : ""}
      </p>

      {phase === "done" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {firstId && <Btn variant="primary" onClick={() => openAsset(firstId)}>Open the first</Btn>}
          {failed.length > 0 && <Btn onClick={() => { setPhase("pick"); }}>Try the {failed.length} again</Btn>}
          <Btn variant={firstId ? "secondary" : "primary"} onClick={reset}>Add more</Btn>
          {onClose && <Btn variant="ghost" onClick={onClose}>Close</Btn>}
        </div>
      ) : items.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block sm:w-64" htmlFor={typeId}>
            <span className="label">Asset type</span>
            <Select id={typeId} value={type} onChange={setType} options={typeOptions} disabled={busy} className="h-9 py-0 pr-8 text-body" />
          </label>
          <span className="flex-1 text-meta text-mute-2 sm:pb-2 sm:text-right">
            {phase === "posters" ? "Taking stills from the videos…" : <>{ready.length} file{ready.length === 1 ? "" : "s"} · {sizeLabel(bytes)}{skipped ? ` · ${skipped} cannot go up` : ""}</>}
          </span>
          <Btn variant="primary" disabled={busy || !ready.length || !!room} onClick={() => void start()}>
            {busy ? "Adding…" : `Add ${ready.length} asset${ready.length === 1 ? "" : "s"}`}
          </Btn>
        </div>
      )}
    </section>
  );
}
