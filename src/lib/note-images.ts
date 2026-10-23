import type { FileRef, PermOverrides, User } from "@/db/schema";
import { can } from "./access";

/*
 * Pictures in notes: screenshots and images pasted, dropped or picked into a
 * note on an offer or an asset. Pure, so the note box and the server agree
 * on what may go in and who may add it.
 */

/** Pictures one note can hold. */
export const MAX_NOTE_IMAGES = 6;

/** What a note picture may be: the raster images every browser shows. */
export const NOTE_IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
export const NOTE_IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
export const NOTE_IMAGE_HINT = "PNG, JPG, GIF or WebP";

const ext = (name: string) => (name.toLowerCase().split(".").pop() ?? "");

/** True when a picked, pasted or dropped file can go in a note. */
export function isNoteImage(f: { name: string; type?: string }): boolean {
  const want = NOTE_IMAGE_TYPES[ext(f.name)];
  if (!want) return false;
  const t = (f.type ?? "").toLowerCase();
  return !t || t === want || (want === "image/jpeg" && t === "image/jpg");
}

type Person = Pick<User, "access"> & { permOverrides?: PermOverrides | null };

/**
 * Who may add pictures to notes: everyone who may write notes (reviewers
 * included: a screenshot is often the clearest feedback), unless an admin
 * has switched uploading off for that one person.
 */
export function mayAddNoteImages(user: Person | null | undefined): boolean {
  if (!user || !can(user, "comment")) return false;
  return user.permOverrides?.upload !== false;
}

/** Where one person's pictures for one item's notes are stored. Every key under it belongs to that note thread. */
export function noteImagePrefix(kind: "offer" | "asset", itemId: string, userId: string): string {
  return `notes/${kind}/${itemId}/${userId}/`;
}

/** The kind and item a note picture's key belongs to, or null when it is not one. */
export function noteImageOwner(key: string): { kind: "offer" | "asset"; itemId: string; userId: string } | null {
  const m = /^notes\/(offer|asset)\/([^/]+)\/([^/]+)\/[^/]+$/.exec(key);
  return m ? { kind: m[1] as "offer" | "asset", itemId: m[2], userId: m[3] } : null;
}

/** "3 pictures", for a note that has no words. */
export function picturesLabel(images: Pick<FileRef, "name">[] | null | undefined): string {
  const n = images?.length ?? 0;
  return n === 1 ? "1 picture" : `${n} pictures`;
}
