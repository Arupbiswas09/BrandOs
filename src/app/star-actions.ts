"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { MAX_STARS, STAR_KINDS } from "@/lib/stars";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import type { Result } from "./actions";

/*
 * Stars: a person's own shortlist for the sidebar and the dashboard. Anyone
 * signed in may star what they can see. Stars are a personal preference, so
 * nothing is written to the activity log and nobody else ever sees them.
 */

class Denied extends Error {}

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (error: string): Result => ({ ok: false, error });

const input = z.object({
  kind: z.enum(STAR_KINDS),
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, "That item has a broken id."),
  on: z.boolean().optional(),
});

function newId() {
  return "st" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * Stars the item, or takes the star away. With `on` the result is that state
 * whatever it was before, so two quick clicks cannot cross over each other.
 * Returns id "on" or "off": the state it ended in.
 */
export async function toggleStar(kind: (typeof STAR_KINDS)[number], itemId: string, on?: boolean): Promise<Result> {
  try {
    const me = await getViewer();
    if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
    const d = input.parse({ kind, itemId, on });
    const db = await getDb();
    const mine = await db.select({ id: s.stars.id, kind: s.stars.kind, itemId: s.stars.itemId }).from(s.stars).where(eq(s.stars.userId, me.id));
    const existing = mine.find((x) => x.kind === d.kind && x.itemId === d.itemId);
    const want = d.on ?? !existing;

    if (!want) {
      // Taking a star away needs no visibility check: it is my own row, and an item I can no longer see should still come off my list.
      if (existing) await db.delete(s.stars).where(and(eq(s.stars.userId, me.id), eq(s.stars.id, existing.id)));
      refresh();
      return ok("off");
    }

    if (existing) return ok("on");
    const all = await readAll();
    const vis = makeVisibility(all, scopeFor(all, me.id));
    const visible = { client: vis.client, brand: vis.brand, service: vis.service, offer: vis.offer, asset: vis.asset }[d.kind];
    const exists = {
      client: () => all.clients.some((x) => x.id === d.itemId),
      brand: () => all.brands.some((x) => x.id === d.itemId),
      service: () => all.services.some((x) => x.id === d.itemId),
      offer: () => all.offers.some((x) => x.id === d.itemId),
      asset: () => all.assets.some((x) => x.id === d.itemId),
    }[d.kind];
    // The same answer whether it was deleted or belongs to a client I cannot see.
    if (!exists() || !visible(d.itemId)) throw new Denied("That is not here any more.");
    if (mine.length >= MAX_STARS) throw new Denied(`You can star up to ${MAX_STARS} things. Unstar one you use less, then try again.`);
    await db.insert(s.stars).values({ id: newId(), userId: me.id, kind: d.kind, itemId: d.itemId }).onConflictDoNothing();
    refresh();
    return ok("on");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "That cannot be starred.");
    console.error(e);
    return fail("That did not save. Try again in a moment.");
  }
}
