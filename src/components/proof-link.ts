"use client";

import { createContext } from "react";
import type { Asset, Comment, FileRef } from "@/db/schema";

/** Raster images the browser shows inline, so notes can be pinned on them. */
export const PROOF_IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

const isPdf = (f: FileRef) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** The files on an asset that the proof view can show: images to pin on, PDFs to download. */
export function proofFiles(a: Pick<Asset, "files">) {
  const files = a.files ?? [];
  return {
    images: files.filter((f) => f.url && f.key && PROOF_IMAGE.test(f.type ?? "")),
    pdfs: files.filter((f) => f.url && isPdf(f)),
  };
}

export type PinnedComment = Comment & { fileKey: string; pinX: number; pinY: number };

export const isPinned = (c: Comment): c is PinnedComment => !!c.fileKey && c.pinX != null && c.pinY != null;

/** Pins on one image, in the order they were made. Their number is their place in this list. */
export function pinsOn(comments: Comment[], fileKey: string): PinnedComment[] {
  return comments.filter(isPinned).filter((c) => c.fileKey === fileKey)
    .sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt));
}

/**
 * Set by the asset drawer. A pinned note in the ordinary discussion calls it
 * to jump to the proof view with that pin selected.
 */
export const PinLink = createContext<((c: PinnedComment) => void) | null>(null);
