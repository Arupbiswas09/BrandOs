"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { DB } from "@/db";
import { can, canChange, type Perm } from "@/lib/access";
import { MAX_COUNT, MAX_LESSON, MAX_PERIOD, MAX_RESULTS_PER_OFFER } from "@/lib/results";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import type { Result } from "./actions";

/*
 * Results per offer: the numbers after launch and one lesson learned. Same
 * checks as src/app/funnel-actions.ts: signed in, allowed to edit, can see
 * the offer, and (contributors) own it. Only admins remove a result: team
 * members never delete data.
 */

class Denied extends Error {}

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (error: string): Result => ({ ok: false, error });

function need(cond: unknown, msg = "You cannot see that.") {
  if (!cond) throw new Denied(msg);
}

/**
 * Loads the signed-in person, checks one permission, and finds the offer they
 * want to work on: given directly, or as the offer a recorded period is on.
 */
async function context(perm: Perm, by: { offerId: string } | { resultId: string }) {
  const me = await getViewer();
  if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
  if (!can(me, perm)) {
    throw new Denied(perm === "del"
      ? "Only admins can remove results. Correct the numbers instead, or ask an admin."
      : "Your role does not allow that. Ask an admin if you need it.");
  }
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const result = "resultId" in by ? all.offerResults.find((r) => r.id === by.resultId) : undefined;
  if ("resultId" in by) need(result, "Those results are not here any more.");
  const offerId = result ? result.offerId : "offerId" in by ? by.offerId : "";
  need(typeof offerId === "string" && vis.offer(offerId), "That offer is not here any more.");
  const offer = all.offers.find((o) => o.id === offerId)!;
  const db = await getDb();
  return { me, all, db, offer, result };
}

async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = await fn();
    refresh();
    return r ?? ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Something in the results is not right.");
    console.error(e);
    return fail("The results did not save. Try again in a moment.");
  }
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** The activity row, in the same shape as `log` in actions.ts. Results are part of the offer's story. */
async function log(db: DB, userId: string, action: string, offer: { id: string; name: string }, field: string) {
  await db.insert(s.activity).values({ id: newId("ac"), userId, action, type: "offer", itemId: offer.id, label: offer.name, field });
}

const countOf = (what: string) => z.number({ error: `${what} must be a whole number.` })
  .int(`${what} must be a whole number.`)
  .min(0, `${what} cannot be below zero.`)
  .max(MAX_COUNT, `${what} looks too large. Check the number.`)
  .nullable().optional();

const resultSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Those results have a broken id.").optional(),
  offerId: z.string().min(1).max(80),
  period: z.string().trim().min(1, "Say which period these numbers cover.").max(MAX_PERIOD, `The period can be up to ${MAX_PERIOD} characters.`),
  endedOn: z.string().max(40).nullable().optional(),
  leads: countOf("Leads"),
  calls: countOf("Calls booked"),
  conversions: countOf("Conversions"),
  spend: z.number({ error: "Spend must be a number." }).min(0, "Spend cannot be below zero.").max(MAX_COUNT, "Spend looks too large. Check the number.").nullable().optional(),
  lesson: z.string().trim().max(MAX_LESSON, `Keep the lesson to ${MAX_LESSON} characters: one thing the team learned.`),
});

export type ResultInput = z.input<typeof resultSchema>;

/** The day a period ended, from a date field ("2026-10-31") or an ISO time. Null clears it. */
function endedFrom(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) throw new Denied("That end date does not look right.");
  const year = d.getFullYear();
  if (year < 2000 || d.getTime() > Date.now() + 400 * 86_400_000) throw new Denied("That end date is too far out. Check the year.");
  return d;
}

/** Records one period's results for an offer, or changes a period already recorded (with `id`). */
export async function saveResult(input: ResultInput) {
  return run(async () => {
    const d = resultSchema.parse(input);
    const { me, all, db, offer } = await context("edit", { offerId: d.offerId });
    if (!canChange(me, offer)) throw new Denied("Contributors can only record results on offers they own. Ask its owner or an editor.");
    const endedOn = endedFrom(d.endedOn);
    const leads = d.leads ?? null, calls = d.calls ?? null, conversions = d.conversions ?? null;
    const spend = d.spend == null ? null : Math.round(d.spend * 100) / 100;
    need(leads !== null || calls !== null || conversions !== null || spend !== null || d.lesson, "Add at least one number or a lesson.");
    if (leads !== null && conversions !== null) need(conversions <= leads, "Conversions cannot be more than leads. Check the numbers.");
    if (leads !== null && calls !== null) need(calls <= leads, "Calls booked cannot be more than leads. Check the numbers.");
    const values = { period: d.period, endedOn, leads, calls, conversions, spend, lesson: d.lesson };

    if (d.id) {
      const existing = all.offerResults.find((r) => r.id === d.id);
      // Results stay with their offer: an id from another offer is treated as missing.
      need(existing && existing.offerId === offer.id, "Those results are not here any more. Reload the page.");
      await db.update(s.offerResults).set({ ...values, updatedAt: new Date() }).where(eq(s.offerResults.id, d.id));
      await log(db, me.id, "updated results for", offer, d.period);
      return ok(d.id);
    }

    const count = all.offerResults.filter((r) => r.offerId === offer.id).length;
    need(count < MAX_RESULTS_PER_OFFER, `An offer holds up to ${MAX_RESULTS_PER_OFFER} periods of results.`);
    const id = newId("rs");
    await db.insert(s.offerResults).values({ id, offerId: offer.id, ...values, createdBy: me.id });
    await log(db, me.id, "recorded results for", offer, d.period);
    return ok(id);
  });
}

/** Takes one period's results away. Admins only: everyone else corrects them instead. */
export async function removeResult(id: string) {
  return run(async () => {
    need(typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id), "Those results are not here any more.");
    const { me, db, offer, result } = await context("del", { resultId: id });
    await db.delete(s.offerResults).where(eq(s.offerResults.id, id));
    await log(db, me.id, "removed results from", offer, result!.period);
  });
}
