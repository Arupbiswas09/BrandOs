import "server-only";
import path from "node:path";
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";

/*
 * Where uploaded files live. Vercel Blob (private) when BLOB_READ_WRITE_TOKEN
 * is set, otherwise .data/uploads on local disk. Either way files are only
 * ever served through /api/files, which checks who is asking.
 */

const LOCAL = path.join(process.cwd(), ".data", "uploads");
const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function safeLocal(key: string) {
  const p = path.join(LOCAL, key);
  if (!p.startsWith(LOCAL + path.sep)) throw new Error("bad key");
  return p;
}

export async function saveFile(key: string, file: File): Promise<void> {
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    await put(key, file, { access: "private", contentType: file.type || undefined, addRandomSuffix: false });
    return;
  }
  const p = safeLocal(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, Buffer.from(await file.arrayBuffer()));
}

export async function readStoredFile(key: string): Promise<{ body: ReadableStream | Buffer; size?: number } | null> {
  if (blobEnabled()) {
    const { get } = await import("@vercel/blob");
    const r = await get(key, { access: "private" });
    return r ? { body: r.stream as ReadableStream } : null;
  }
  try {
    const p = safeLocal(key);
    const s = await stat(p);
    return { body: await readFile(p), size: s.size };
  } catch {
    return null;
  }
}

export async function removeStoredFile(key: string): Promise<void> {
  try {
    if (blobEnabled()) {
      const { del } = await import("@vercel/blob");
      await del(key);
      return;
    }
    await rm(safeLocal(key), { force: true });
  } catch {
    // Losing track of an orphaned file is better than failing the edit.
  }
}

export function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
