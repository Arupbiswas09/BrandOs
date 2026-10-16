"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { DB } from "@/db";
import type { Brand } from "@/db/schema";
import { can } from "@/lib/access";
import { ASSET_TYPES, SEGMENT_PALETTE, offerTypesOf } from "@/lib/constants";
import { MAX_CELL, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS, planDriveLinks, planImport, type BrandFacts, type FieldKey } from "@/lib/import-plan";
import { readAll, makeVisibility, scopeFor, type All } from "@/server/data";
import { draftNewOfferFunnel } from "@/server/funnel";
import { getViewer } from "@/server/session";

/*
 * Bringing existing offers and assets in from a spreadsheet, or many Google
 * Drive links at once. The browser only sends the raw rows, what each
 * column holds and the person's choices; everything is planned again here
 * against the brand as it is now (src/lib/import-plan.ts), with the same
 * limits as the offer and asset forms in actions.ts. The checks are the same
 * as theirs: signed in, allowed to edit, can see the brand. Contributors own
 * what they import. The whole import is one transaction and one line in the
 * brand's history.
 */

export type ImportResult =
  | { ok: true; brandId: string; kind: "offers" | "assets"; created: { id: string; name: string }[]; skipped: number; added: string[] }
  | { ok: false; error: string };

class Denied extends Error {}

function need(cond: unknown, msg: string) {
  if (!cond) throw new Denied(msg);
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function context(brandId: unknown) {
  const me = await getViewer();
  if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
  if (!can(me, "edit")) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  need(typeof brandId === "string" && vis.brand(brandId), "That brand is not here any more.");
  const brand = all.brands.find((b) => b.id === brandId)!;
  need(!brand.archived, `${brand.name} is archived. Restore it before importing into it.`);
  return { me, all, vis, brand, db: await getDb() };
}

async function run(fn: () => Promise<ImportResult>): Promise<ImportResult> {
  try {
    const r = await fn();
    refresh();
    return r;
  } catch (e) {
    if (e instanceof Denied) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Something in the import is not right." };
    console.error(e);
    return { ok: false, error: "The import did not save, and nothing was changed. Try again in a moment." };
  }
}

/** What the planner needs to know about a brand, from everything on the server. */
function factsOf(all: All, brand: Brand): BrandFacts {
  return {
    services: all.services.filter((v) => v.brandId === brand.id).map((v) => ({ id: v.id, name: v.name, archived: v.archived })),
    segments: brand.segments.map((x) => x.name),
    offerTypes: offerTypesOf(brand),
    goals: brand.goals.map((g) => g.name),
    offers: all.offers.filter((o) => o.brandId === brand.id).map((o) => ({ id: o.id, name: o.name })),
    assets: all.assets.filter((a) => a.brandId === brand.id).map((a) => ({ id: a.id, name: a.name, url: a.url })),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function logImport(db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], userId: string, brand: Brand, what: string, field = "") {
  await db.insert(s.activity).values({ id: newId("ac"), userId, action: `imported ${what} into`, type: "brand", itemId: brand.id, label: brand.name, field });
}

/* ---------------------------------------------------------------- the final checks, as in actions.ts */

const str = (max = 5000) => z.string().trim().max(max);
const offerRow = z.object({
  name: z.string().trim().min(1).max(200), short: str(120), positioning: str(), promise: str(), proof: str(),
  segment: str(80), goals: z.array(str(80)).max(20), offerType: str(80), status: z.enum(["Ideation", "Active", "Paused", "Archived"]),
  tags: z.array(str(40)).max(30), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
const assetRow = z.object({
  name: z.string().trim().min(1).max(200), type: z.string().refine((t) => t in ASSET_TYPES), channel: str(80), status: z.enum(["Draft", "Ready", "Live", "Archived"]),
  short: str(300), url: str(1000), notes: str(), tags: z.array(str(40)).max(30), offerIds: z.array(z.string()).max(200),
});

const FIELD_KEYS = ["name", "short", "service", "segment", "positioning", "promise", "proof", "goals", "offerType", "status", "tags", "launch", "type", "url", "channel", "offers", "notes"] as const satisfies readonly FieldKey[];
const list = z.array(z.string().max(400)).max(MAX_IMPORT_ROWS * 4);
const rowsInput = z.object({
  brandId: z.string().max(64),
  kind: z.enum(["offers", "assets"]),
  columns: z.array(z.enum(FIELD_KEYS).nullable()).max(MAX_IMPORT_COLUMNS, `Import up to ${MAX_IMPORT_COLUMNS} columns.`),
  rows: z.array(z.array(z.string().max(MAX_CELL, `A cell can hold up to ${MAX_CELL} characters.`)).max(MAX_IMPORT_COLUMNS))
    .min(1, "There are no rows to import.").max(MAX_IMPORT_ROWS, `That is too many rows. Import up to ${MAX_IMPORT_ROWS} at a time.`),
  choices: z.object({
    create: z.object({ service: list.optional(), segment: list.optional(), offerType: list.optional(), goal: list.optional() }).default({}),
    types: z.record(z.string().max(400), z.string().max(80)).default({}),
    duplicates: z.array(z.number().int().min(0).max(MAX_IMPORT_ROWS)).max(MAX_IMPORT_ROWS).default([]),
  }),
});

export type ImportRowsInput = z.input<typeof rowsInput>;

/** Imports spreadsheet rows as offers or assets of one brand, exactly as the preview showed them. */
export async function importRows(input: ImportRowsInput): Promise<ImportResult> {
  return run(async () => {
    const d = rowsInput.parse(input);
    const { me, all, brand, db } = await context(d.brandId);
    const facts = factsOf(all, brand);
    const plan = planImport(d.kind, d.columns, d.rows, facts, { shape: can(me, "structure") || can(me, "kit"), publish: can(me, "publish") }, d.choices);
    need(!plan.blocked, plan.blocked ?? "");
    const take = plan.rows.filter((r) => r.include);
    need(take.length, "Nothing to import: every row is skipped. Check the preview.");
    const noun = d.kind === "offers" ? "offer" : "asset";
    const created: { id: string; name: string }[] = [];
    const added: string[] = [];

    await db.transaction(async (tx) => {
      if (d.kind === "offers") {
        // New services, segments, goals and offer types first: only the ones a row that is coming in uses.
        const serviceIds = new Map<string, string>();
        for (const name of plan.adds.services) {
          const id = newId("sv");
          await tx.insert(s.services).values({ id, brandId: brand.id, name: name.slice(0, 200), short: "", description: "", ownerId: me.id });
          serviceIds.set(name.toLowerCase(), id);
        }
        if (plan.adds.services.length) added.push(plural(plan.adds.services.length, "service"));
        const patch: Partial<Brand> = {};
        if (plan.adds.segments.length) {
          const rest = brand.segments.filter((x) => x.name !== "All segments");
          const fresh = plan.adds.segments.map((name, i) => ({ name, color: SEGMENT_PALETTE[(rest.length + i) % SEGMENT_PALETTE.length] }));
          need(rest.length + fresh.length < 24, "A brand holds up to 24 segments.");
          patch.segments = [...rest, ...fresh, { name: "All segments", color: "#46534D" }];
          added.push(plural(fresh.length, "segment"));
        }
        if (plan.adds.goals.length) {
          patch.goals = [...brand.goals.map((g) => ({ ...g })), ...plan.adds.goals.map((name) => ({ name, description: "" }))];
          added.push(plural(plan.adds.goals.length, "goal"));
        }
        if (plan.adds.offerTypes.length) {
          patch.offerTypes = [...offerTypesOf(brand), ...plan.adds.offerTypes];
          added.push(plural(plan.adds.offerTypes.length, "offer type"));
        }
        if (Object.keys(patch).length) await tx.update(s.brands).set({ ...patch, updatedAt: new Date() }).where(eq(s.brands.id, brand.id));

        const values = take.map((r) => {
          const o = offerRow.parse(r.offer);
          const serviceId = r.offer!.serviceId ?? (r.offer!.newService ? serviceIds.get(r.offer!.newService.toLowerCase()) ?? null : null);
          const id = newId("of");
          created.push({ id, name: o.name });
          return {
            id, brandId: brand.id, serviceId, name: o.name, short: o.short, positioning: o.positioning, promise: o.promise, proof: o.proof,
            segment: o.segment || "All segments", goals: o.goals, offerType: o.offerType, status: o.status, tags: o.tags,
            primaryCtaId: null, secondaryCtaId: null, ownerId: me.id,
            // Noon keeps the date on the same day in every timezone, as dueFrom does.
            dueAt: o.dueAt ? new Date(`${o.dueAt}T12:00:00`) : null,
          };
        });
        for (let i = 0; i < values.length; i += 100) await tx.insert(s.offers).values(values.slice(i, i + 100));
      } else {
        const offerIds = new Set(facts.offers.map((o) => o.id));
        const linkRows: { id: string; assetId: string; offerId: string; createdBy: string }[] = [];
        const values = take.map((r) => {
          const a = assetRow.parse(r.asset);
          if (a.status === "Live") need(can(me, "publish"), "Your role cannot mark work Live. Send it for review instead.");
          const id = newId("as");
          created.push({ id, name: a.name });
          for (const offerId of a.offerIds) {
            need(offerIds.has(offerId), "Assets can only be linked to offers in their own brand.");
            linkRows.push({ id: newId("lk"), assetId: id, offerId, createdBy: me.id });
          }
          return {
            id, brandId: brand.id, name: a.name, type: a.type, channel: a.channel || "Owned", status: a.status, short: a.short, url: a.url,
            notes: a.notes, specs: "", audienceNotes: "", aiPrompt: "", ctaId: null, delivery: "None", gated: false, copy: null, tags: a.tags,
            ownerId: me.id, isTemplate: a.type === "Template", items: a.type === "Checklist" ? [] : null,
          };
        });
        for (let i = 0; i < values.length; i += 100) await tx.insert(s.assets).values(values.slice(i, i + 100));
        for (let i = 0; i < linkRows.length; i += 200) await tx.insert(s.links).values(linkRows.slice(i, i + 200)).onConflictDoNothing();
      }
      await logImport(tx, me.id, brand, plural(created.length, noun), added.length ? `added ${added.join(", ")}` : "from a spreadsheet");
    });
    // New offers get their first funnel, as they do from the offer form.
    if (d.kind === "offers") for (const o of created) await draftNewOfferFunnel(db, o.id);
    return { ok: true, brandId: brand.id, kind: d.kind, created, skipped: plan.rows.length - created.length, added };
  });
}

const driveInput = z.object({
  brandId: z.string().max(64),
  offerId: z.string().max(64).nullable().optional(),
  links: z.array(z.object({ name: z.string().max(400), url: z.string().max(2000) }))
    .min(1, "Paste at least one link.").max(MAX_IMPORT_ROWS, `That is too many links. Import up to ${MAX_IMPORT_ROWS} at a time.`),
  duplicates: z.array(z.number().int().min(0).max(MAX_IMPORT_ROWS)).max(MAX_IMPORT_ROWS).default([]),
});

export type ImportDriveInput = z.input<typeof driveInput>;

/** Pasted Google Drive and Docs links become "Drive link" assets in the brand, optionally linked to one of its offers. */
export async function importDriveLinks(input: ImportDriveInput): Promise<ImportResult> {
  return run(async () => {
    const d = driveInput.parse(input);
    const { me, all, vis, brand, db } = await context(d.brandId);
    const offer = d.offerId ? all.offers.find((o) => o.id === d.offerId) : null;
    if (d.offerId) need(offer && vis.offer(offer.id) && offer.brandId === brand.id, "Assets can only be linked to offers in their own brand.");
    const plan = planDriveLinks(d.links, factsOf(all, brand), d.duplicates);
    need(!plan.blocked, plan.blocked ?? "");
    const take = plan.rows.filter((r) => r.include);
    need(take.length, "Nothing to import: every link is skipped. Check the preview.");
    const created: { id: string; name: string }[] = [];
    await db.transaction(async (tx) => {
      const values = take.map((r) => {
        const a = assetRow.parse({ name: r.name, type: "Drive link", channel: "Owned", status: "Draft", short: "", url: r.url, notes: "", tags: [], offerIds: [] });
        const id = newId("as");
        created.push({ id, name: a.name });
        return {
          id, brandId: brand.id, name: a.name, type: "Drive link", channel: "Owned", status: "Draft" as const, short: "", url: a.url, notes: "",
          specs: "", audienceNotes: "", aiPrompt: "", ctaId: null, delivery: "None", gated: false, copy: null, tags: [], ownerId: me.id, isTemplate: false, items: null,
        };
      });
      for (let i = 0; i < values.length; i += 100) await tx.insert(s.assets).values(values.slice(i, i + 100));
      if (offer) await tx.insert(s.links).values(created.map((c) => ({ id: newId("lk"), assetId: c.id, offerId: offer.id, createdBy: me.id }))).onConflictDoNothing();
      await logImport(tx, me.id, brand, plural(created.length, "Drive link"), offer ? `linked to ${offer.name}` : "");
    });
    return { ok: true, brandId: brand.id, kind: "assets", created, skipped: plan.rows.length - created.length, added: [] };
  });
}
