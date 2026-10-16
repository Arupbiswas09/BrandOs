import "server-only";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

/*
 * Reading part of a stored file, so video and audio can seek and Safari will
 * play them at all (it only plays media served as byte ranges). Files live
 * where src/server/storage.ts puts them: Vercel Blob (private) when
 * BLOB_READ_WRITE_TOKEN is set, otherwise .data/uploads on local disk.
 * Local reads stream from disk, so a long video never sits in memory.
 */

const LOCAL = path.join(process.cwd(), ".data", "uploads");
const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function safeLocal(key: string) {
  const p = path.join(LOCAL, key);
  if (!p.startsWith(LOCAL + path.sep)) throw new Error("bad key");
  return p;
}

/** The stored file's size in bytes, or null if it is not in storage. */
export async function storedSize(key: string): Promise<number | null> {
  try {
    if (blobEnabled()) {
      const { head } = await import("@vercel/blob");
      return (await head(key)).size;
    }
    return (await stat(safeLocal(key))).size;
  } catch {
    return null;
  }
}

/**
 * Bytes `start` to `end` (inclusive) of a stored file. `partial` is false
 * when storage sent the whole file instead, which the caller then serves
 * as a full response.
 */
export async function readStoredRange(key: string, start: number, end: number): Promise<{ body: ReadableStream; partial: boolean } | null> {
  try {
    if (blobEnabled()) {
      const { get } = await import("@vercel/blob");
      const r = await get(key, { access: "private", headers: { range: `bytes=${start}-${end}` } });
      if (!r?.stream) return null;
      return { body: r.stream as ReadableStream, partial: !!r.headers.get("content-range") };
    }
    const p = safeLocal(key);
    await stat(p);
    return { body: Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream, partial: true };
  } catch {
    return null;
  }
}

/**
 * One byte range from a Range header, clamped to the file. null means "send
 * the whole file" (no header, several ranges, or not bytes); "unsatisfiable"
 * means the range starts past the end and the answer is 416.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {
    // "bytes=-500": the last 500 bytes.
    const n = Number(m[2]);
    if (!n) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
