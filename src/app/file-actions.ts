"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { can, canChange } from "@/lib/access";
import { currentKeyOf, swapIn } from "@/lib/file-versions";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { storedSize } from "@/server/stored-range";
import type { Result } from "./actions";

/*
 * Earlier versions of an asset's files. Replacing a file keeps the old one
 * (src/app/api/assets/[id]/files/route.ts); this puts one back. Same checks
 * as uploading: signed in, allowed to upload, can see the asset, and
 * (contributors) own it; the Global Library needs its own permission.
 */

class Denied extends Error {}

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (error: string): Result => ({ ok: false, error });

function need(cond: unknown, msg = "You cannot see that.") {
  if (!cond) throw new Denied(msg);
}

async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = await fn();
    refresh();
    return r ?? ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "That version is not right.");
    console.error(e);
    return fail("That did not save. Try again in a moment.");
  }
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

const versionId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "That version is not here any more.");

/**
 * Puts an earlier version of a file back in place of the file there now.
 * The file there now becomes an earlier version itself, so nothing is lost
 * and the swap can always be made again.
 */
export async function restoreFileVersion(id: string) {
  return run(async () => {
    const me = await getViewer();
    if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
    if (!can(me, "upload")) throw new Denied("Uploading is switched off for you. Ask an admin if you need it.");
    versionId.parse(id);
    const all = await readAll();
    const vis = makeVisibility(all, scopeFor(all, me.id));
    const v = all.fileVersions.find((x) => x.id === id);
    need(v && vis.asset(v.assetId), "That version is not here any more.");
    const asset = all.assets.find((a) => a.id === v!.assetId)!;
    if (!canChange(me, asset)) throw new Denied("Contributors can only change work they own. Ask its owner or an editor.");
    if (!asset.brandId) need(can(me, "library"), "Only managers and admins can change the Global Library.");

    const back = v!.file;
    need(back.key, "That version was never stored here, so it cannot be put back.");
    const keys = new Set(asset.files.map((f) => f.key).filter((k): k is string => !!k));
    const currentKey = currentKeyOf(all.fileVersions, v!, keys);
    need(currentKey, "The file this version belongs to is no longer on the asset.");
    need((await storedSize(back.key!)) !== null, "That version's file is missing from storage, so it cannot be put back.");

    const at = asset.files.findIndex((f) => f.key === currentKey);
    const now = asset.files[at];
    const { next, displaced } = swapIn(asset.files, at, back);
    const kept = displaced.filter((f) => f.key && f.key !== back.key);
    const when = new Date();
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.update(s.assets).set({ files: next, updatedAt: when }).where(eq(s.assets.id, asset.id));
      // The restored file is current again, so it is no longer a version.
      await tx.delete(s.fileVersions).where(eq(s.fileVersions.id, v!.id));
      if (kept.length) {
        // Versions that led to the file there now lead to the restored one, so the history stays one list.
        await tx.update(s.fileVersions).set({ replacedByKey: back.key! })
          .where(and(eq(s.fileVersions.assetId, asset.id), inArray(s.fileVersions.replacedByKey, kept.map((f) => f.key!))));
        await tx.insert(s.fileVersions).values(kept.map((file) => ({
          id: newId("fv"), assetId: asset.id, file, replacedByKey: back.key!, replacedBy: me.id, replacedAt: when,
        })));
      }
      await tx.insert(s.activity).values({
        id: newId("ac"), userId: me.id, action: "restored an earlier version of a file on", type: "asset", itemId: asset.id, label: asset.name,
        field: now.name === back.name ? back.name : `${now.name} → ${back.name}`,
      });
    });
  });
}
