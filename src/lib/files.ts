import type { FileRef } from "@/db/schema";
import { ASSET_TYPES } from "./constants";
import { kindOf } from "./upload-policy";

/*
 * Small rules about files, shared by the bulk upload (browser and server)
 * and the previews: what a file is called once it becomes an asset, what
 * kind of asset it starts as, and how it can be shown.
 */

/** "Detect from file" in the bulk upload's type choice. */
export const AUTO_TYPE = "auto";

/**
 * A file name tidied into an asset name: no extension, dashes and
 * underscores as spaces, sentence case. Words in capitals (IG, SEO, A4)
 * stay as they are.
 *   "summer-sale_IG-story-01.png" → "Summer sale IG story 01"
 */
export function tidyName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const bare = base.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const words = bare.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "Untitled file";
  return words
    .map((w, i) => {
      const caps = w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);
      const word = caps ? w : w.toLowerCase();
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ")
    .slice(0, 200);
}

/**
 * The asset type a file starts as when nobody chooses one: pictures and
 * video are social posts in a brand and ad creatives in the Global Library;
 * PDFs and everything else are documents.
 */
export function typeForFile(file: { name: string; type?: string | null }, inLibrary: boolean): string {
  const mime = (file.type ?? "").toLowerCase();
  const kind = kindOf(file.name);
  if (mime.startsWith("image/") || mime.startsWith("video/") || kind === "image" || kind === "video") return inLibrary ? "Ad creative" : "Social post";
  return "Document";
}

/** The types offered for a whole bulk upload: a brand's work, or what the Global Library holds. */
export function bulkTypeOptions(inLibrary: boolean): string[] {
  const list = Object.entries(ASSET_TYPES)
    .filter(([k, t]) => k !== "Newsletter ad" && (inLibrary ? t.cat === "global" : t.cat !== "global"))
    .map(([k]) => k);
  // A PDF in the library starts as a Document, so it is offered there too.
  return inLibrary && !list.includes("Document") ? [...list, "Document"] : list;
}

export type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "other";

/** Raster images the browser shows inline. SVG is left out on purpose: it can carry script, so it always downloads. */
export const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;
const TEXT = /^(text\/(plain|markdown|x-markdown|csv)|application\/json)$/;

/** How a stored file can be shown in the browser. Goes by the type the server stored, then the extension. */
export function previewKind(file: Pick<FileRef, "name" | "type">): PreviewKind {
  const t = (file.type ?? "").toLowerCase();
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (INLINE_IMAGE.test(t)) return "image";
  if (t === "application/pdf" || (!t && ext === "pdf")) return "pdf";
  if (t.startsWith("video/") || (!t && kindOf(file.name) === "video")) return "video";
  if (t.startsWith("audio/") || (!t && kindOf(file.name) === "audio")) return "audio";
  if (TEXT.test(t) || (!t && ["txt", "md", "csv", "json"].includes(ext))) return "text";
  return "other";
}

/**
 * What an asset's preview area shows first: its first file that can be shown
 * (an image, PDF, video, audio or text), else its link, else its first stored
 * file as a card. Null when there is nothing at all.
 */
export function primaryPreview(a: { files: FileRef[]; url?: string | null }): { kind: "file"; file: FileRef } | { kind: "link"; url: string } | null {
  const stored = a.files.filter((f) => f.key && f.url);
  const shown = stored.find((f) => previewKind(f) !== "other");
  if (shown) return { kind: "file", file: shown };
  if (a.url?.trim()) return { kind: "link", url: a.url.trim() };
  return stored[0] ? { kind: "file", file: stored[0] } : null;
}

/** "PDF", "PNG": the extension, as people say it. */
export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "");
