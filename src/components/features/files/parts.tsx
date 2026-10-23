"use client";

import { createElement } from "react";
import { CirclePlay, ClipboardList, File as FileIcon, FileArchive, FileAudio, FileImage, FileText, FileType, FileVideo, Folder, PenTool, Presentation, Sheet, type LucideIcon } from "lucide-react";
import type { FileRef } from "@/db/schema";
import type { EmbedKind } from "@/lib/embeds";
import { INLINE_IMAGE } from "@/lib/files";
import { kindOf, type FileKind } from "@/lib/upload-policy";
import { cx } from "@/components/ui";

/** A link that looks like a small secondary button (Download, Open). Same height and border as Btn size sm. */
export const LINK_BTN = "inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-meta font-medium text-ink-3 transition-[background-color,border-color,color,transform] duration-150 ease-snap hover:border-line-strong hover:bg-wash active:scale-[0.97] [&>svg]:flex-none";

const GLYPH: Record<FileKind, LucideIcon> = {
  image: FileImage, video: FileVideo, audio: FileAudio, document: FileText, design: FileImage, font: FileType, archive: FileArchive,
};

/** The icon for a file's kind (image, video, document…), from its extension. */
export function KindIcon({ name, size = 16, strokeWidth = 1.8 }: { name: string; size?: number; strokeWidth?: number }) {
  return createElement(GLYPH[kindOf(name) as FileKind] ?? FileIcon, { size, strokeWidth, "aria-hidden": true });
}

/** A small picture of the file: the image itself when it is one the browser shows, or an icon for its kind. */
export function FileGlyph({ f, size = 36, src }: { f: Pick<FileRef, "name" | "type" | "url">; size?: 32 | 36 | 40; src?: string | null }) {
  const box = { 32: "size-8", 36: "size-9", 40: "size-10" }[size];
  const img = src ?? (f.url && INLINE_IMAGE.test(f.type ?? "") ? `${f.url}?inline=1` : null);
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file (or a local preview); the name sits beside it
    return <img src={img} alt="" loading={src ? "eager" : "lazy"} decoding="async" className={cx(box, "flex-none rounded-lg border border-line bg-wash object-cover")} />;
  }
  return <span aria-hidden className={cx(box, "flex flex-none items-center justify-center rounded-lg bg-chip text-mute-3")}><KindIcon name={f.name} size={size === 40 ? 18 : 16} /></span>;
}

const SOURCE: Record<EmbedKind | "pdf", LucideIcon> = {
  doc: FileText, sheet: Sheet, slides: Presentation, form: ClipboardList, folder: Folder, file: FileIcon,
  video: CirclePlay, playlist: CirclePlay, design: PenTool, pdf: FileText,
};

/** The icon for what a link is (a Google Doc, a Drive folder, a video, a PDF), from `linkSource`. Drawn here, never fetched from the site. */
export function SourceIcon({ kind, size = 14, strokeWidth = 1.8, className }: { kind: EmbedKind | "pdf"; size?: number; strokeWidth?: number; className?: string }) {
  return createElement(SOURCE[kind] ?? FileIcon, { size, strokeWidth, className, "aria-hidden": true });
}
