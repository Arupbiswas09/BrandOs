import type { ClientFile, ClientVideo, FileRef } from "@/db/schema";

/*
 * Files and video links on a client's page. A file that is replaced stays
 * with it as an earlier version (newest first), the way an asset's files
 * keep theirs, so a wrong upload can be undone. Pure, so the page and the
 * server agree on what a version is.
 */

type Version = NonNullable<ClientFile["earlier"]>[number];

/** The file itself, without what the list keeps about it. */
export function refOf(f: ClientFile | Version): FileRef {
  const { name, size, url, key, type, bytes, uploadedBy } = f;
  return { name, size, url, key, type, bytes, uploadedBy };
}

const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);

/**
 * Puts a newly stored file on the list. With `replaceId` it takes that
 * file's place; otherwise a file of the same name becomes its new version
 * (the same rule as an asset's files), and anything else is added at the end.
 */
export function putNewVersion(files: ClientFile[], fresh: FileRef, o: { replaceId?: string; by: string; at: string }): ClientFile[] {
  const at = o.replaceId ? files.findIndex((f) => f.id === o.replaceId) : files.findIndex((f) => f.name === fresh.name);
  if (at < 0) return [...files, { ...fresh, id: newId("cf"), addedAt: o.at }];
  return files.map((f, i) => i !== at ? f : {
    ...fresh, id: f.id, addedAt: o.at,
    earlier: [{ ...refOf(f), replacedAt: o.at, replacedBy: o.by }, ...(f.earlier ?? [])],
  });
}

/** Puts an earlier version back as the current file. The file it replaces becomes the newest earlier version. */
export function putBack(files: ClientFile[], fileId: string, key: string, o: { by: string; at: string }): ClientFile[] | null {
  const f = files.find((x) => x.id === fileId);
  const v = f?.earlier?.find((x) => x.key === key);
  if (!f || !v) return null;
  return files.map((x) => x.id !== fileId ? x : {
    ...refOf(v), id: f.id, addedAt: o.at,
    earlier: [{ ...refOf(f), replacedAt: o.at, replacedBy: o.by }, ...(f.earlier ?? []).filter((e) => e.key !== key)],
  });
}

/** Every stored file a client's list points at, earlier versions included. */
export function clientFileKeys(files: (ClientFile | Record<string, unknown>)[] | null | undefined): string[] {
  const out: string[] = [];
  for (const f of (files ?? []) as ClientFile[]) {
    if (f?.key) out.push(f.key);
    for (const v of f?.earlier ?? []) if (v?.key) out.push(v.key);
  }
  return out;
}

/** The file stored under `key` on this list, current or earlier, or null. */
export function clientFileByKey(files: ClientFile[], key: string): FileRef | null {
  for (const f of files) {
    if (f.key === key) return refOf(f);
    const v = f.earlier?.find((x) => x.key === key);
    if (v) return refOf(v);
  }
  return null;
}

/** A new video link, or the edited one. */
export function withVideo(videos: ClientVideo[], v: { id?: string; title: string; url: string }, o: { by: string; at: string }): ClientVideo[] {
  if (v.id && videos.some((x) => x.id === v.id)) return videos.map((x) => (x.id === v.id ? { ...x, title: v.title, url: v.url } : x));
  return [...videos, { id: newId("cv"), title: v.title, url: v.url, addedBy: o.by, addedAt: o.at }];
}
