import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { limitsFor, parseSize, resolvePolicy, type MyUploadLimits, type UploadPolicy } from "@/lib/upload-policy";
import { maxUploadBytes } from "@/server/uploads";
import type { All } from "@/server/data";

const KEY = "upload_policy";

export async function getUploadPolicy(): Promise<UploadPolicy> {
  const db = await getDb();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, KEY)).limit(1);
  return resolvePolicy(row?.value as Partial<UploadPolicy> | undefined);
}

export async function putUploadPolicy(policy: UploadPolicy, userId: string) {
  const db = await getDb();
  await db.insert(s.settings).values({ key: KEY, value: policy, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.settings.key, set: { value: policy, updatedBy: userId, updatedAt: new Date() } });
}

type Stored = Pick<All, "assets"> & Partial<Pick<All, "fileVersions">>;

/**
 * Bytes stored, across everything and for one person. Older files are counted from their size label.
 * Earlier versions kept for "Put this version back" take room too: each counts once, against whoever uploaded it.
 */
export function storageUsage(all: Stored, userId?: string) {
  let workspaceBytes = 0, personBytes = 0;
  for (const a of all.assets) {
    for (const f of a.files) {
      if (!f.key) continue; // links and placeholders take no space
      const b = f.bytes ?? parseSize(f.size);
      workspaceBytes += b;
      // Files from before uploads were attributed count against the asset's owner.
      if (userId && (f.uploadedBy ?? a.ownerId) === userId) personBytes += b;
    }
  }
  if (all.fileVersions?.length) {
    const owner = new Map(all.assets.map((a) => [a.id, a.ownerId]));
    // A stored file still on some asset (a clone) is already counted above.
    const counted = new Set(all.assets.flatMap((a) => a.files.map((f) => f.key).filter((k): k is string => !!k)));
    for (const v of all.fileVersions) {
      const k = v.file.key;
      if (!k || counted.has(k) || !owner.has(v.assetId)) continue;
      counted.add(k);
      const b = v.file.bytes ?? parseSize(v.file.size);
      workspaceBytes += b;
      if (userId && (v.file.uploadedBy ?? owner.get(v.assetId)) === userId) personBytes += b;
    }
  }
  return { workspaceBytes, personBytes };
}

export function myLimits(all: Stored, policy: UploadPolicy, user: { id: string; uploadLimitMb: number | null; storageQuotaMb: number | null }): MyUploadLimits {
  return limitsFor(policy, user, storageUsage(all, user.id), maxUploadBytes());
}
