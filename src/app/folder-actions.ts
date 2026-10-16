"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { DB } from "@/db";
import { can, canChange } from "@/lib/access";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { removeStoredFile } from "@/server/storage";
import { keyInUse } from "@/server/thumbnails";
import type { Result } from "./actions";

/*
 * Folders on an offer page. They only group that offer's links: moving an
 * asset into one, or removing one, never touches the asset itself. Same
 * checks as src/app/funnel-actions.ts: signed in, allowed to edit, can see
 * the offer, and (contributors) own it.
 */

class Denied extends Error {}

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (error: string): Result => ({ ok: false, error });

function need(cond: unknown, msg = "You cannot see that.") {
  if (!cond) throw new Denied(msg);
}

/**
 * Loads the signed-in person, everything they can see, and the offer whose
 * folders they want to change: given directly, or as the offer a folder is on.
 */
async function context(by: { offerId: string } | { folderId: string }) {
  const me = await getViewer();
  if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
  if (!can(me, "edit")) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const folder = "folderId" in by ? all.folders.find((f) => f.id === by.folderId) : undefined;
  if ("folderId" in by) need(folder, "That folder is not here any more.");
  const offerId = folder ? folder.offerId : "offerId" in by ? by.offerId : "";
  need(typeof offerId === "string" && vis.offer(offerId), "That offer is not here any more.");
  const offer = all.offers.find((o) => o.id === offerId)!;
  if (!canChange(me, offer)) throw new Denied("Contributors can only change work they own. Ask its owner or an editor.");
  const db = await getDb();
  return { me, all, vis, db, offer, folder };
}

/** The same, starting from a folder, which is then certain to exist. */
async function folderContext(folderId: string) {
  const ctx = await context({ folderId });
  return { ...ctx, folder: ctx.folder! };
}

async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = await fn();
    refresh();
    return r ?? ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "That folder name is not right.");
    console.error(e);
    return fail("That did not save. Try again in a moment.");
  }
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** The activity row, in the same shape as `log` in actions.ts. Folder changes are changes to the offer. */
async function log(db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], userId: string, action: string, offer: { id: string; name: string }, field = "") {
  await db.insert(s.activity).values({ id: newId("ac"), userId, action, type: "offer", itemId: offer.id, label: offer.name, field });
}

const MAX_FOLDERS = 40;
const folderName = z.string().trim().min(1, "Give the folder a name.").max(60, "Folder names can be up to 60 characters.");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function createFolder(offerId: string, name: string) {
  let id: string | undefined;
  return run(async () => {
    const { me, all, db, offer } = await context({ offerId });
    const n = folderName.parse(name);
    const mine = all.folders.filter((f) => f.offerId === offer.id);
    need(mine.length < MAX_FOLDERS, `An offer holds up to ${MAX_FOLDERS} folders.`);
    need(!mine.some((f) => same(f.name, n)), `There is already a folder called ${n} here.`);
    id = newId("fd");
    await db.insert(s.assetFolders).values({ id, offerId: offer.id, name: n, thumbnail: null, createdBy: me.id });
    await log(db, me.id, "added a folder to", offer, n);
    return ok(id);
  });
}

export async function renameFolder(id: string, name: string) {
  return run(async () => {
    const { me, all, db, offer, folder } = await folderContext(id);
    const n = folderName.parse(name);
    if (n === folder.name) return;
    need(!all.folders.some((f) => f.offerId === offer.id && f.id !== id && same(f.name, n)), `There is already a folder called ${n} here.`);
    await db.update(s.assetFolders).set({ name: n, updatedAt: new Date() }).where(eq(s.assetFolders.id, id));
    await log(db, me.id, "renamed a folder on", offer, `${folder.name} → ${n}`);
  });
}

/** Takes the folder away. Its assets go back to the top level of the offer; nothing is deleted. */
export async function removeFolder(id: string) {
  return run(async () => {
    const { me, all, db, offer, folder } = await folderContext(id);
    await db.transaction(async (tx) => {
      await tx.update(s.links).set({ folderId: null }).where(and(eq(s.links.offerId, offer.id), eq(s.links.folderId, id)));
      await tx.delete(s.assetFolders).where(eq(s.assetFolders.id, id));
      await log(tx, me.id, "removed a folder from", offer, folder.name);
    });
    const key = folder.thumbnail?.key;
    if (key && !keyInUse(all, key, { folderId: id })) await removeStoredFile(key);
  });
}

/** Files one of the offer's assets into a folder, or back to the top level with `folderId` null. */
export async function moveToFolder(offerId: string, assetId: string, folderId: string | null) {
  return run(async () => {
    const { me, all, vis, db, offer } = await context({ offerId });
    need(typeof assetId === "string" && vis.asset(assetId), "That asset is not here any more.");
    const link = all.links.find((l) => l.offerId === offer.id && l.assetId === assetId);
    need(link, "That asset is not linked to this offer any more.");
    const to = folderId === null ? null : all.folders.find((f) => f.id === folderId && f.offerId === offer.id);
    need(to !== undefined, "That folder is not here any more.");
    if ((link!.folderId ?? null) === (to?.id ?? null)) return;
    const asset = all.assets.find((a) => a.id === assetId)!;
    await db.update(s.links).set({ folderId: to?.id ?? null }).where(eq(s.links.id, link!.id));
    const from = all.folders.find((f) => f.id === link!.folderId);
    if (to) await log(db, me.id, "moved an asset into a folder on", offer, `${asset.name} → ${to.name}`);
    else await log(db, me.id, "took an asset out of a folder on", offer, `${asset.name}${from ? ` from ${from.name}` : ""}`);
  });
}
