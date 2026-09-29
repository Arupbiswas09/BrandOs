"use server";

import { refresh } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { DB } from "@/db";
import type { Funnel, FunnelLink, Offer } from "@/db/schema";
import { can, canChange } from "@/lib/access";
import { MAX_ARROWS, MAX_BOXES, MAX_COORD, MAX_LABEL, MAX_TEXT, buildDraft, draftSource, pruneArrows, sameLink } from "@/lib/funnel";
import { readAll, makeVisibility, scopeFor, type All } from "@/server/data";
import { getViewer } from "@/server/session";
import type { Result } from "./actions";

/*
 * The funnel board on each offer page. Same checks as src/app/actions.ts:
 * signed in, allowed to edit, can see the offer, and (contributors) own it.
 */

class Denied extends Error {}

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (error: string): Result => ({ ok: false, error });

function need(cond: unknown, msg = "You cannot see that.") {
  if (!cond) throw new Denied(msg);
}

/** Loads the signed-in person, everything they can see, and the offer they want to change. */
async function context(offerId: string) {
  const me = await getViewer();
  if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
  if (!can(me, "edit")) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  need(typeof offerId === "string" && vis.offer(offerId), "That offer is not here any more.");
  const offer = all.offers.find((o) => o.id === offerId)!;
  if (!canChange(me, offer)) throw new Denied("Contributors can only change work they own. Ask its owner or an editor.");
  const db = await getDb();
  return { me, all, vis, db, offer };
}

async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = await fn();
    refresh();
    return r ?? ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Something on the board is not right.");
    console.error(e);
    return fail("The funnel did not save. Try again in a moment.");
  }
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * The activity row, in the same shape as `log` in actions.ts. Autosave writes
 * often, so one person's edits to one board within 15 minutes share a row.
 */
async function logFunnel(db: DB, userId: string, offer: Offer) {
  const action = "updated the funnel on";
  const [last] = await db.select({ id: s.activity.id, createdAt: s.activity.createdAt }).from(s.activity)
    .where(and(eq(s.activity.userId, userId), eq(s.activity.itemId, offer.id), eq(s.activity.action, action)))
    .orderBy(desc(s.activity.createdAt)).limit(1);
  if (last && Date.now() - new Date(last.createdAt).getTime() < 15 * 60_000) {
    await db.update(s.activity).set({ createdAt: new Date(), label: offer.name }).where(eq(s.activity.id, last.id));
    return;
  }
  await db.insert(s.activity).values({ id: newId("ac"), userId, action, type: "offer", itemId: offer.id, label: offer.name, field: "" });
}

const itemId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "A box or arrow on the board has a broken id.");
const coord = z.number().finite().min(0).max(MAX_COORD);
const linkSchema = z.object({ type: z.enum(["asset", "offer", "service", "cta"]), id: z.string().min(1).max(80) });
const boxSchema = z.object({
  id: itemId,
  kind: z.enum(["step", "stage", "note"]),
  x: coord,
  y: coord,
  w: z.number().finite().min(80).max(640).optional(),
  text: z.string().max(MAX_TEXT, `Text in a box can be up to ${MAX_TEXT} characters.`),
  link: linkSchema.optional(),
});
const arrowSchema = z.object({
  id: itemId,
  from: itemId,
  to: itemId,
  label: z.string().max(MAX_LABEL, `Arrow labels can be up to ${MAX_LABEL} characters.`).optional(),
});
const funnelSchema = z.object({
  boxes: z.array(boxSchema).max(MAX_BOXES, `A board holds up to ${MAX_BOXES} boxes.`),
  arrows: z.array(arrowSchema).max(MAX_ARROWS, `A board holds up to ${MAX_ARROWS} arrows.`),
});

/** Whether this person may point a box on this offer's board at that item. */
function linkAllowed(all: All, vis: ReturnType<typeof makeVisibility>, offer: Offer, link: FunnelLink) {
  switch (link.type) {
    case "asset": {
      const a = all.assets.find((x) => x.id === link.id);
      return !!a && vis.asset(a.id) && (!a.brandId || a.brandId === offer.brandId);
    }
    case "offer": {
      const o = all.offers.find((x) => x.id === link.id);
      return !!o && vis.offer(o.id) && o.brandId === offer.brandId;
    }
    case "service": {
      const v = all.services.find((x) => x.id === link.id);
      return !!v && vis.service(v.id) && v.brandId === offer.brandId;
    }
    case "cta": {
      const c = all.ctas.find((x) => x.id === link.id);
      return !!c && vis.cta(c.id) && c.brandId === offer.brandId;
    }
  }
}

/** Replaces the offer's funnel with this one. Called by the board's autosave. */
export async function saveFunnel(offerId: string, funnel: Funnel) {
  return run(async () => {
    const { me, all, vis, db, offer } = await context(offerId);
    const d = funnelSchema.parse(funnel);
    const ids = new Set<string>();
    for (const b of d.boxes) {
      need(!ids.has(b.id), "Two boxes on the board share an id. Reload the page and try again.");
      ids.add(b.id);
    }
    // A link that was already there stays, even if its item has since gone; new or changed links are checked.
    const before = new Map((offer.funnel?.boxes ?? []).map((b) => [b.id, b.link]));
    for (const b of d.boxes) {
      if (!b.link || sameLink(before.get(b.id), b.link)) continue;
      need(linkAllowed(all, vis, offer, b.link), "A box links to something you cannot see, or to something from another brand.");
    }
    const clean: Funnel = pruneArrows({
      boxes: d.boxes.map((b) => ({
        id: b.id, kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), text: b.text,
        ...(b.w !== undefined && { w: Math.round(b.w) }),
        ...(b.link && { link: { type: b.link.type, id: b.link.id } }),
      })),
      arrows: d.arrows.map((a) => ({ id: a.id, from: a.from, to: a.to, ...(a.label && { label: a.label }) })),
    });
    await db.update(s.offers).set({ funnel: clean, updatedAt: new Date() }).where(eq(s.offers.id, offer.id));
    await logFunnel(db, me.id, offer);
  });
}

/** Lays a first funnel out from the offer's linked assets, CTA and goal. Only on an empty board. */
export async function draftFunnel(offerId: string) {
  return run(async () => {
    const { me, all, vis, db, offer } = await context(offerId);
    need(!(offer.funnel?.boxes?.length), "This funnel already has boxes. Clear it first if you want a fresh draft.");
    const linked = new Set(all.links.filter((l) => l.offerId === offer.id).map((l) => l.assetId));
    const assets = all.assets.filter((a) => linked.has(a.id) && vis.asset(a.id) && (!a.brandId || a.brandId === offer.brandId));
    const ctaOk = !!offer.primaryCtaId && vis.cta(offer.primaryCtaId) && all.ctas.find((c) => c.id === offer.primaryCtaId)?.brandId === offer.brandId;
    const draft = buildDraft(draftSource({ ...offer, primaryCtaId: ctaOk ? offer.primaryCtaId : null }, assets));
    need(draft.boxes.length, "There is nothing linked to this offer to draft from yet. Start blank instead.");
    await db.update(s.offers).set({ funnel: draft, updatedAt: new Date() }).where(eq(s.offers.id, offer.id));
    await logFunnel(db, me.id, offer);
  });
}
