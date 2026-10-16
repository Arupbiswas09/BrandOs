import type { FileRef, FileVersion } from "@/db/schema";

/*
 * Earlier versions of an asset's files. When a stored file is replaced the
 * old one is kept as a `file_versions` row whose `replacedByKey` names the
 * file now in its place. Writers keep that pointing at the current file, but
 * these helpers also follow a chain (A replaced by B, B replaced by C), so
 * every version is found either way. Pure, so the drawer and the server
 * agree on what counts as a version of what.
 */

type Row = Pick<FileVersion, "id" | "assetId" | "replacedByKey" | "file" | "replacedAt">;

/** Earlier versions of the file stored under `key` on one asset, newest first. */
export function versionsOf<T extends Row>(rows: T[], assetId: string, key: string): T[] {
  const mine = rows.filter((r) => r.assetId === assetId && r.replacedByKey);
  const seen = new Set([key]);
  const found = new Set<T>();
  let frontier = new Set([key]);
  while (frontier.size) {
    const next = new Set<string>();
    for (const r of mine) {
      if (found.has(r) || !frontier.has(r.replacedByKey!)) continue;
      found.add(r);
      const k = r.file.key;
      if (k && !seen.has(k)) { seen.add(k); next.add(k); }
    }
    frontier = next;
  }
  return [...found].sort((a, b) => new Date(b.replacedAt).getTime() - new Date(a.replacedAt).getTime());
}

/** The key of the file on the asset now that this version leads to, or null if that file has gone. */
export function currentKeyOf(rows: Row[], version: Row, currentKeys: Set<string>): string | null {
  let k = version.replacedByKey;
  const seen = new Set<string>();
  while (k && !currentKeys.has(k) && !seen.has(k)) {
    seen.add(k);
    const at = k;
    k = rows.find((r) => r.assetId === version.assetId && r.file.key === at)?.replacedByKey ?? null;
  }
  return k && currentKeys.has(k) ? k : null;
}

/**
 * Puts `fresh` in the slot `at` of an asset's file list. Any other entry with
 * the same name gives way, as with a normal upload, so a name is never
 * listed twice. Returns the new list and every entry that left it.
 */
export function swapIn(files: FileRef[], at: number, fresh: FileRef): { next: FileRef[]; displaced: FileRef[] } {
  const displaced: FileRef[] = [];
  const next = files.flatMap((x, i) => {
    if (i === at) { displaced.push(x); return [fresh]; }
    if (x.name === fresh.name) { displaced.push(x); return []; }
    return [x];
  });
  return { next, displaced };
}
