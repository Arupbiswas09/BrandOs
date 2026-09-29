import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { schema as s } from "@/db";
import type { DB } from "@/db";
import type { Funnel } from "@/db/schema";
import { buildDraft, draftSource } from "@/lib/funnel";

/**
 * Gives a newly created offer a first funnel from what it already has (its
 * CTA, first goal, service and any linked assets), so a filled-in offer
 * never opens on a blank board. Leaves a funnel that already has boxes
 * alone, and never fails the save that called it.
 */
export async function draftNewOfferFunnel(db: DB, offerId: string): Promise<void> {
  try {
    const [offer] = await db.select().from(s.offers).where(eq(s.offers.id, offerId));
    if (!offer || offer.funnel?.boxes?.length) return;
    const linkRows = await db.select({ assetId: s.links.assetId }).from(s.links).where(eq(s.links.offerId, offerId));
    const ids = linkRows.map((l) => l.assetId);
    const rows = ids.length
      ? await db.select({ id: s.assets.id, type: s.assets.type, archived: s.assets.archived, brandId: s.assets.brandId }).from(s.assets).where(inArray(s.assets.id, ids))
      : [];
    const byId = new Map(rows.filter((a) => !a.brandId || a.brandId === offer.brandId).map((a) => [a.id, a]));
    const assets = ids.map((id) => byId.get(id)).filter((a) => !!a);
    const cta = offer.primaryCtaId
      ? (await db.select({ id: s.ctas.id }).from(s.ctas).where(and(eq(s.ctas.id, offer.primaryCtaId), eq(s.ctas.brandId, offer.brandId))))[0]
      : undefined;
    const draft: Funnel = buildDraft(draftSource({ ...offer, primaryCtaId: cta?.id ?? null }, assets));
    if (!draft.boxes.length) return;
    await db.update(s.offers).set({ funnel: draft }).where(eq(s.offers.id, offerId));
  } catch (e) {
    // The offer itself saved; a missing draft only means the board starts empty.
    console.error("Could not draft a funnel for", offerId, e);
  }
}
