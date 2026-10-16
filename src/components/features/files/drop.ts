/*
 * Browser helpers for the bulk upload: every file in a drop (folders
 * included, where the browser lets us look inside them), and a poster frame
 * for a video, taken locally before anything is sent.
 */

/** System clutter that is never meant as an upload. */
const JUNK = /^(\.|Thumbs\.db$|desktop\.ini$|__MACOSX$)/i;
/** A folder of thousands should not freeze the tab while it is read. */
const MAX_FILES = 500;

type Entry = FileSystemEntry;

function readAllEntries(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader();
  const out: Entry[] = [];
  return new Promise((resolve) => {
    // readEntries hands them over in batches until an empty one.
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(out);
      out.push(...batch);
      if (out.length >= MAX_FILES) return resolve(out);
      next();
    }, () => resolve(out));
    next();
  });
}

const fileOf = (e: FileSystemFileEntry) => new Promise<File | null>((resolve) => e.file((f) => resolve(f), () => resolve(null)));

async function walk(entry: Entry, out: File[]) {
  if (out.length >= MAX_FILES || JUNK.test(entry.name)) return;
  if (entry.isFile) {
    const f = await fileOf(entry as FileSystemFileEntry);
    if (f && !JUNK.test(f.name)) out.push(f);
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) await walk(child, out);
  }
}

/**
 * Every file in a drop. Folders are opened, sub-folders too, when the
 * browser supports it (webkitGetAsEntry); otherwise the plain file list.
 * Entries have to be taken during the drop event itself, so call this
 * straight from the handler and await the result.
 */
export function filesFromDrop(data: DataTransfer | null): Promise<File[]> {
  if (!data) return Promise.resolve([]);
  const items = Array.from(data.items ?? []).filter((i) => i.kind === "file");
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null));
  if (!entries.length || entries.some((e) => !e)) return Promise.resolve(Array.from(data.files ?? []).filter((f) => !JUNK.test(f.name)));
  return (async () => {
    const out: File[] = [];
    for (const e of entries) await walk(e!, out);
    return out;
  })();
}

/**
 * A still from about one second into a video, as a JPEG ready to upload as
 * the asset's thumbnail. Null when the browser cannot decode the video (some
 * codecs only play on some systems); the card then shows the file's icon.
 */
export function capturePoster(file: File, at = 1, timeoutMs = 8000): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    let settled = false;
    const finish = (out: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      resolve(out);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 2;
      v.currentTime = Math.min(at, d / 2);
    };
    v.onseeked = () => {
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return finish(null);
      const scale = Math.min(1, 1280 / w);
      const c = document.createElement("canvas");
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return finish(null);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const base = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "video";
      c.toBlob((b) => finish(b ? new File([b], `${base} poster.jpg`, { type: "image/jpeg" }) : null), "image/jpeg", 0.85);
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}
