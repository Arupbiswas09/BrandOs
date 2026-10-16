"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { LinkCheck } from "@/db/schema";
import { can, canChange } from "@/lib/access";
import { linkCheckOf } from "@/lib/link-health";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { checkAssetLink, recordLinkCheck, runLinkChecks, type LinkRunResult } from "@/server/link-check";
import { getUploadPolicy } from "@/server/limits";
import { setPagePicture } from "@/server/page-picture";
import { getViewer } from "@/server/session";
import type { Result } from "./actions";

/*
 * Link checks and page pictures, asked for by a person. Same checks as
 * src/app/actions.ts: signed in, allowed by their role, can see the item,
 * and (contributors, for changes) own it.
 */

class Denied extends Error {}

const fail = (error: string) => ({ ok: false as const, error });

function need(cond: unknown, msg = "You cannot see that.") {
  if (!cond) throw new Denied(msg);
}

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "That is not a valid id.");

async function context() {
  const me = await getViewer();
  if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  return { me, all, vis };
}

async function run<T extends { ok: true }>(fn: () => Promise<T | { ok: false; error: string }>, failed: string): Promise<T | { ok: false; error: string }> {
  try {
    const r = await fn();
    refresh();
    return r;
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? failed);
    console.error(e);
    return fail(failed);
  }
}

/** A second press within this long gets the result that is already there. */
const AGAIN_AFTER_MS = 10_000;

/** Opens one asset's link now and saves the result. */
export async function checkLinkNow(assetId: string): Promise<{ ok: true; check: LinkCheck } | { ok: false; error: string }> {
  return run(async () => {
    const { me, all, vis } = await context();
    if (!can(me, "edit")) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
    const aid = id.parse(assetId);
    need(vis.asset(aid), "That asset is not here any more.");
    const asset = all.assets.find((a) => a.id === aid)!;
    need(asset.url.trim(), "This asset has no link to check.");
    const last = linkCheckOf(asset);
    if (last && Date.now() - new Date(last.checkedAt).getTime() < AGAIN_AFTER_MS) return { ok: true as const, check: last };
    const check = await checkAssetLink(asset);
    await recordLinkCheck(asset, check, me.id);
    return { ok: true as const, check };
  }, "The link could not be checked. Try again in a moment.");
}

/** Checks every link in a brand (and its sub-brands) now. For admins and managers. */
export async function checkBrandLinks(brandId: string): Promise<LinkRunResult | { ok: false; error: string }> {
  return run(async () => {
    const { me, all, vis } = await context();
    if (!can(me, "structure")) throw new Denied("Only admins and managers can check a whole brand's links.");
    const bid = id.parse(brandId);
    need(vis.brand(bid), "That brand is not here any more.");
    // Sub-brands the person cannot see are left out, like everywhere else.
    return runLinkChecks({ force: true, brandId: bid, limit: 100, budgetMs: 45_000, actor: me.id, all, only: vis.asset });
  }, "The links could not be checked. Try again in a moment.");
}

/**
 * Sets the asset's card picture from the page its link opens: the share
 * image the page names for itself. Same rules as uploading a thumbnail.
 */
// Named as asked for by the features brief; it is a server action, not a React hook.
export async function usePagePicture(assetId: string): Promise<Result> {
  return run(async () => {
    const { me, all, vis } = await context();
    if (!can(me, "edit")) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
    if (!can(me, "upload")) throw new Denied("Uploading is switched off for you. Ask an admin if you need it.");
    const aid = id.parse(assetId);
    need(vis.asset(aid), "That asset is not here any more.");
    const asset = all.assets.find((a) => a.id === aid)!;
    if (!canChange(me, asset)) throw new Denied("Contributors can only change work they own. Ask its owner or an editor.");
    if (!asset.brandId && !can(me, "library")) throw new Denied("Only managers and admins can change the Global Library.");
    const r = await setPagePicture(all, asset, me, await getUploadPolicy());
    return r.ok ? { ok: true as const, id: asset.id } : r;
  }, "The page's picture could not be used. Try again in a moment.");
}
