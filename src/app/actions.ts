"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { DB } from "@/db";
import { seed } from "@/db/seed";
import { can, type Perm } from "@/lib/access";
import { DEFAULT_GOALS, ASSET_TYPES } from "@/lib/constants";
import { isHex, onColor } from "@/lib/color";
import { readAll, makeVisibility, scopeFor, type All } from "@/server/data";
import { authMode, endSession, getViewer, startSession } from "@/server/session";
import { removeStoredFile } from "@/server/storage";

export type Result = { ok: true; id?: string } | { ok: false; error: string };

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (error: string): Result => ({ ok: false, error });

class Denied extends Error {}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** Loads the signed-in person and checks one permission. Every action starts here. */
async function context(perm?: Perm) {
  const me = await getViewer();
  if (!me) throw new Denied("You are signed out. Sign in again to keep working.");
  if (perm && !can(me, perm)) throw new Denied("Your access level does not allow that.");
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const db = await getDb();
  return { me, all, vis, db };
}

async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = await fn();
    refresh();
    return r ?? ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Something in the form is not right.");
    console.error(e);
    return fail("That did not save. Try again in a moment.");
  }
}

async function log(db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], userId: string, action: string, type: string, itemId: string, label: string, field = "") {
  await db.insert(s.activity).values({ id: newId("ac"), userId, action, type, itemId, label, field });
}

function need(cond: unknown, msg = "You cannot see that.") {
  if (!cond) throw new Denied(msg);
}

const str = (max = 5000) => z.string().trim().max(max);
const name = (what: string) => z.string().trim().min(1, `Give the ${what} a name.`).max(200);

/* ================================================================ session */

export async function signInAs(userId: string) {
  if (authMode() !== "demo") return fail("Demo sign-in is switched off.");
  const db = await getDb();
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId));
  if (!u) return fail("That person does not exist.");
  await endSession();
  await startSession(u.id);
  redirect("/");
}

/** Switch who you are looking through. Demo mode only, like the prototype. */
export async function switchUser(userId: string) {
  return run(async () => {
    if (authMode() !== "demo") throw new Denied("Switching people is only available in demo mode.");
    const db = await getDb();
    const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId));
    need(u, "That person does not exist.");
    await endSession();
    await startSession(userId);
  });
}

export async function signOut() {
  await endSession();
  redirect("/sign-in");
}

export async function resetDemo() {
  return run(async () => {
    if (authMode() !== "demo") throw new Denied("Reset is only available in demo mode.");
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const t of [s.shareLinks, s.links, s.comments, s.activity, s.recents, s.reads, s.assetVersions, s.assets, s.offers, s.ctas, s.services, s.brands, s.clients, s.groups, s.invites]) {
        await tx.delete(t);
      }
      await tx.delete(s.sessions);
      await tx.delete(s.users);
    });
    await seed(db);
    await startSession("pr");
  });
}

/* ================================================================ navigation */

export async function trackVisit(kind: "brand" | "offer" | "service" | "asset" | "client", itemId: string) {
  const me = await getViewer();
  if (!me) return;
  const db = await getDb();
  await db
    .insert(s.recents)
    .values({ userId: me.id, kind, itemId, visitedAt: new Date() })
    .onConflictDoUpdate({ target: [s.recents.userId, s.recents.kind, s.recents.itemId], set: { visitedAt: new Date() } });
}

export async function markMentionsRead(commentIds: string[]) {
  const me = await getViewer();
  if (!me || !commentIds.length) return;
  const db = await getDb();
  await db.insert(s.reads).values(commentIds.slice(0, 200).map((commentId) => ({ userId: me.id, commentId }))).onConflictDoNothing();
  refresh();
}

/* ================================================================ clients */

const clientDraft = z.object({
  id: z.string().optional(),
  name: name("client"),
  kind: str(200).default(""),
  note: str().default(""),
  since: str(20).optional(),
  contactId: z.string().nullable().optional(),
});

export async function saveClient(input: z.input<typeof clientDraft>) {
  let id = input.id;
  const r = await run(async () => {
    const { me, vis, db } = await context("edit");
    const d = clientDraft.parse(input);
    if (d.id) {
      need(vis.client(d.id));
      await db.update(s.clients).set({ name: d.name, kind: d.kind, note: d.note, contactId: d.contactId ?? undefined, updatedAt: new Date() }).where(eq(s.clients.id, d.id));
      await log(db, me.id, "updated", "client", d.id, d.name, "Details");
    } else {
      id = newId("cl");
      await db.insert(s.clients).values({ id, name: d.name, kind: d.kind, note: d.note, contactId: me.id, since: d.since || String(new Date().getFullYear()) });
      // Someone with a narrow scope should still see the client they just made.
      if (!me.allClients) await db.update(s.users).set({ clientIds: [...me.clientIds, id] }).where(eq(s.users.id, me.id));
      await log(db, me.id, "created", "client", id, d.name);
    }
    return ok(id);
  });
  return r;
}

/* ================================================================ brands */

const segmentSchema = z.object({ name: str(80).min(1), color: z.string().refine(isHex, "Colours must be hex values.") });
const brandDraft = z.object({
  id: z.string().optional(),
  clientId: z.string(),
  parentId: z.string().nullable().optional(),
  name: name("brand"),
  tagline: str(200).default(""),
  mark: str(3).optional(),
  primary: z.string().refine(isHex, "Pick a primary colour.").default("#2D4A5C"),
  secondary: z.string().refine(isHex, "Pick a secondary colour.").default("#7BA0A8"),
  description: str().default(""),
  voice: str().default(""),
  boilerplate: str().optional(),
  segments: z.array(segmentSchema).max(24).optional(),
  colours: z.array(z.object({ name: str(80), hex: z.string().refine(isHex), usage: str(300) })).max(24).optional(),
  fonts: z.array(z.object({ name: str(80), role: str(120), files: str(120) })).max(24).optional(),
  /** [from, to] pairs from the kit editor, so offers follow a renamed segment. */
  segmentRenames: z.array(z.tuple([str(80), str(80)])).max(24).optional(),
});

export async function saveBrand(input: z.input<typeof brandDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    const d = brandDraft.parse(input);
    need(vis.client(d.clientId), "You cannot add brands to that client.");
    if (d.parentId) need(vis.brand(d.parentId));
    const mark = (d.mark || d.name.slice(0, 2)).toUpperCase();
    const patch = {
      name: d.name, tagline: d.tagline, mark, primary: d.primary, secondary: d.secondary,
      description: d.description, voice: d.voice, clientId: d.clientId,
      ...(d.boilerplate !== undefined && { boilerplate: d.boilerplate }),
      ...(d.segments && { segments: withAllSegments(d.segments) }),
      ...(d.colours && { colours: d.colours }),
      ...(d.fonts && { fonts: d.fonts }),
    };
    if (d.id) {
      need(vis.brand(d.id));
      const before = all.brands.find((b) => b.id === d.id)!;
      if (d.segments) {
        const keep = new Set(d.segments.map((x) => x.name));
        const renamed = new Set((d.segmentRenames ?? []).map(([f]) => f));
        const orphaned = before.segments.filter((x) => x.name !== "All segments" && !keep.has(x.name) && !renamed.has(x.name))
          .filter((x) => all.offers.some((o) => o.brandId === d.id && o.segment === x.name));
        if (orphaned.length) throw new Denied(`Offers still use ${orphaned[0].name}. Move them before removing it.`);
      }
      await db.transaction(async (tx) => {
        await tx.update(s.brands).set({ ...patch, updatedAt: new Date() }).where(eq(s.brands.id, d.id!));
        // Renamed segments carry their offers with them.
        if (d.segmentRenames) {
          for (const [from, to] of d.segmentRenames) {
            if (!from || !to || from === to || from === "All segments") continue;
            await tx.update(s.offers).set({ segment: to }).where(and(eq(s.offers.brandId, d.id!), eq(s.offers.segment, from)));
          }
        }
        // A move to another client takes the sub-brands along.
        if (before.clientId !== d.clientId) {
          await tx.update(s.brands).set({ clientId: d.clientId }).where(eq(s.brands.parentId, d.id!));
        }
        await log(tx, me.id, "updated", "brand", d.id!, d.name, "Identity");
      });
    } else {
      id = newId("br");
      await db.insert(s.brands).values({
        id, ...patch, parentId: d.parentId ?? null, ownerId: me.id, boilerplate: d.boilerplate ?? "",
        goals: DEFAULT_GOALS.map((g) => ({ ...g })),
        segments: withAllSegments(d.segments ?? []),
        colours: d.colours ?? [
          { name: "Primary", hex: d.primary, usage: "Buttons, links, headings." },
          { name: "Secondary", hex: d.secondary, usage: "Emphasis only." },
        ],
      });
      await log(db, me.id, "created", "brand", id, d.name);
    }
    return ok(id);
  });
}

function withAllSegments(list: { name: string; color: string }[]) {
  const rest = list.filter((x) => x.name !== "All segments");
  return [...rest, { name: "All segments", color: "#566560" }];
}

/* ================================================================ services */

const serviceDraft = z.object({
  id: z.string().optional(),
  brandId: z.string(),
  name: name("service"),
  short: str(200).default(""),
  description: str().default(""),
});

export async function saveService(input: z.input<typeof serviceDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, vis, db } = await context("edit");
    const d = serviceDraft.parse(input);
    need(vis.brand(d.brandId));
    if (d.id) {
      need(vis.service(d.id));
      await db.update(s.services).set({ name: d.name, short: d.short, description: d.description, updatedAt: new Date() }).where(eq(s.services.id, d.id));
      await log(db, me.id, "updated", "service", d.id, d.name, "Details");
    } else {
      id = newId("sv");
      await db.insert(s.services).values({ id, brandId: d.brandId, name: d.name, short: d.short, description: d.description, ownerId: me.id });
      await log(db, me.id, "created", "service", id, d.name);
    }
    return ok(id);
  });
}

/* ================================================================ offers */

const offerDraft = z.object({
  id: z.string().optional(),
  brandId: z.string(),
  serviceId: z.string().nullable().optional(),
  name: name("offer"),
  short: str(120).default(""),
  positioning: str().default(""),
  promise: str().default(""),
  proof: str().default(""),
  segment: str(80).default("All segments"),
  goals: z.array(str(80)).max(20).default([]),
  offerType: str(80).default(""),
  status: z.enum(["Ideation", "Active", "Paused", "Archived"]).default("Ideation"),
  ownerId: z.string().nullable().optional(),
  primaryCtaId: z.string().nullable().optional(),
  secondaryCtaId: z.string().nullable().optional(),
  tags: z.array(str(40)).max(30).optional(),
});

export async function saveOffer(input: z.input<typeof offerDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    const d = offerDraft.parse(input);
    need(vis.brand(d.brandId));
    const serviceId = d.serviceId || null;
    if (serviceId) need(all.services.find((v) => v.id === serviceId)?.brandId === d.brandId, "That service belongs to another brand.");
    const ctaOk = (c?: string | null) => !c || all.ctas.find((x) => x.id === c)?.brandId === d.brandId;
    need(ctaOk(d.primaryCtaId) && ctaOk(d.secondaryCtaId), "CTAs have to come from the same brand.");
    const values = {
      brandId: d.brandId, serviceId, name: d.name, short: d.short, positioning: d.positioning, promise: d.promise,
      proof: d.proof, segment: d.segment, goals: d.goals, offerType: d.offerType, status: d.status,
      primaryCtaId: d.primaryCtaId || null, secondaryCtaId: d.secondaryCtaId || null,
      ...(d.tags && { tags: d.tags }),
      ...(d.ownerId && { ownerId: d.ownerId }),
    };
    if (d.id) {
      need(vis.offer(d.id));
      await db.update(s.offers).set({ ...values, updatedAt: new Date() }).where(eq(s.offers.id, d.id));
      await log(db, me.id, "updated", "offer", d.id, d.name, "Details");
    } else {
      id = newId("of");
      await db.insert(s.offers).values({ id, ...values, ownerId: d.ownerId || me.id });
      await log(db, me.id, "created", "offer", id, d.name);
    }
    return ok(id);
  });
}

/* ================================================================ assets */

const fileRef = z.object({ name: str(300), size: str(40), url: z.string().optional(), key: z.string().optional(), type: z.string().optional() });
const assetDraft = z.object({
  id: z.string().optional(),
  brandId: z.string().nullable(),
  name: name("asset"),
  type: z.string().refine((t) => t in ASSET_TYPES, "Pick what kind of asset this is."),
  channel: str(80).default("Owned"),
  status: z.enum(["Draft", "Ready", "Live", "Archived"]).default("Draft"),
  short: str(300).default(""),
  url: str(1000).default(""),
  notes: str().default(""),
  specs: str(1000).default(""),
  audienceNotes: str(2000).default(""),
  aiPrompt: str(4000).default(""),
  ctaId: z.string().nullable().optional(),
  delivery: str(80).default("None"),
  gated: z.boolean().default(false),
  isTemplate: z.boolean().optional(),
  tags: z.array(str(40)).max(30).optional(),
  copy: z.object({ headline: str(1000), body: str(8000), cta: str(200) }).nullable().optional(),
  files: z.array(fileRef).max(100).optional(),
  items: z.array(z.object({ text: str(500), done: z.boolean() })).max(200).nullable().optional(),
  promptFor: str(120).optional(),
  prompt: str(20000).optional(),
  offerIds: z.array(z.string()).max(200).default([]),
});

function assetSnapshot(a: s.Asset) {
  const { id: _id, createdAt: _c, ...rest } = a;
  return rest as Record<string, unknown>;
}

export async function saveAsset(input: z.input<typeof assetDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    const d = assetDraft.parse(input);
    if (d.brandId) need(vis.brand(d.brandId));
    for (const oid of d.offerIds) {
      const o = all.offers.find((x) => x.id === oid);
      need(o && vis.offer(oid) && o.brandId === d.brandId, "Assets can only be linked to offers in their own brand.");
    }
    const hasCopy = d.copy && (d.copy.headline || d.copy.body || d.copy.cta);
    const values = {
      brandId: d.brandId, name: d.name, type: d.type, channel: d.channel, status: d.status, short: d.short,
      url: d.url, notes: d.notes, specs: d.specs, audienceNotes: d.audienceNotes, aiPrompt: d.aiPrompt,
      ctaId: d.ctaId || null, delivery: d.delivery, gated: d.gated,
      copy: hasCopy ? d.copy! : null,
      ...(d.isTemplate !== undefined && { isTemplate: d.isTemplate }),
      ...(d.tags && { tags: d.tags }),
      ...(d.files && { files: d.files }),
      ...(d.items !== undefined && { items: d.items }),
      ...(d.promptFor !== undefined && { promptFor: d.promptFor }),
      ...(d.prompt !== undefined && { prompt: d.prompt }),
    };
    await db.transaction(async (tx) => {
      if (d.id) {
        need(vis.asset(d.id));
        const before = all.assets.find((a) => a.id === d.id)!;
        await tx.insert(s.assetVersions).values({ id: newId("av"), assetId: d.id, version: before.version, data: assetSnapshot(before), userId: me.id });
        await tx.update(s.assets).set({ ...values, version: before.version + 1, updatedAt: new Date() }).where(eq(s.assets.id, d.id));
        await tx.delete(s.links).where(eq(s.links.assetId, d.id));
        await log(tx, me.id, "updated", "asset", d.id, d.name, "Details");
      } else {
        id = newId("as");
        const type = ASSET_TYPES[d.type];
        await tx.insert(s.assets).values({
          id: id!, ...values, ownerId: me.id,
          isTemplate: d.isTemplate ?? d.type === "Template",
          items: d.items ?? (d.type === "Checklist" ? [] : null),
          ...(type?.cat === "global" && !d.brandId && { review: "Approved" as const }),
        });
        await log(tx, me.id, "created", "asset", id!, d.name);
      }
      if (d.offerIds.length) {
        await tx.insert(s.links).values(d.offerIds.map((offerId) => ({ id: newId("lk"), assetId: id!, offerId, createdBy: me.id }))).onConflictDoNothing();
      }
    });
    return ok(id);
  });
}

const cloneDraft = z.object({
  srcId: z.string(),
  name: name("clone"),
  brandId: z.string().nullable(),
  offerIds: z.array(z.string()).default([]),
  keepFiles: z.boolean().default(true),
  keepCopy: z.boolean().default(true),
});

export async function cloneAsset(input: z.input<typeof cloneDraft>) {
  let id: string | undefined;
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    const d = cloneDraft.parse(input);
    need(vis.asset(d.srcId));
    if (d.brandId) need(vis.brand(d.brandId));
    const src = all.assets.find((a) => a.id === d.srcId)!;
    for (const oid of d.offerIds) need(all.offers.find((o) => o.id === oid)?.brandId === d.brandId, "Link the clone to offers in its new brand.");
    id = newId("as");
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = src;
    await db.transaction(async (tx) => {
      await tx.insert(s.assets).values({
        ...rest, id: id!, name: d.name, brandId: d.brandId, clonedFromId: src.id, status: "Draft", review: "None",
        reviewerId: null, changeNote: "", version: 1, ownerId: me.id, archived: false,
        files: d.keepFiles ? src.files : [], copy: d.keepCopy ? src.copy : null,
        items: src.items ? src.items.map((i) => ({ ...i, done: false })) : src.items,
      });
      if (d.offerIds.length) await tx.insert(s.links).values(d.offerIds.map((offerId) => ({ id: newId("lk"), assetId: id!, offerId, createdBy: me.id })));
      await log(tx, me.id, "cloned", "asset", id!, d.name, `from ${src.name}`);
    });
    return ok(id);
  });
}

export async function restoreVersion(assetId: string, versionId: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.asset(assetId));
    const current = all.assets.find((a) => a.id === assetId)!;
    const [v] = await db.select().from(s.assetVersions).where(and(eq(s.assetVersions.id, versionId), eq(s.assetVersions.assetId, assetId)));
    need(v, "That version no longer exists.");
    const data = v.data as Partial<s.Asset>;
    await db.transaction(async (tx) => {
      await tx.insert(s.assetVersions).values({ id: newId("av"), assetId, version: current.version, data: assetSnapshot(current), userId: me.id });
      await tx.update(s.assets).set({
        name: data.name ?? current.name, short: data.short ?? "", copy: data.copy ?? null, files: data.files ?? [],
        notes: data.notes ?? "", specs: data.specs ?? "", audienceNotes: data.audienceNotes ?? "", aiPrompt: data.aiPrompt ?? "",
        url: data.url ?? "", channel: data.channel ?? current.channel, type: data.type ?? current.type,
        items: data.items ?? current.items, prompt: data.prompt ?? current.prompt, promptFor: data.promptFor ?? current.promptFor,
        ctaId: data.ctaId ?? null, delivery: data.delivery ?? current.delivery, gated: data.gated ?? current.gated,
        version: current.version + 1, updatedAt: new Date(),
      }).where(eq(s.assets.id, assetId));
      await log(tx, me.id, "restored version", "asset", assetId, current.name, `v${v.version}`);
    });
  });
}

export async function listVersions(assetId: string) {
  const me = await getViewer();
  if (!me) return [];
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  if (!vis.asset(assetId)) return [];
  const db = await getDb();
  const rows = await db.select().from(s.assetVersions).where(eq(s.assetVersions.assetId, assetId)).orderBy(desc(s.assetVersions.version)).limit(50);
  return rows.map((r) => ({
    id: r.id, version: r.version, userId: r.userId, createdAt: r.createdAt.getTime(),
    name: String((r.data as { name?: string }).name ?? ""),
    headline: String(((r.data as { copy?: { headline?: string } }).copy?.headline) ?? ""),
  }));
}

/* ================================================================ links */

export async function toggleLink(assetId: string, offerId: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.asset(assetId) && vis.offer(offerId));
    const a = all.assets.find((x) => x.id === assetId)!;
    const o = all.offers.find((x) => x.id === offerId)!;
    need(!a.brandId || a.brandId === o.brandId, "An asset can only be linked to offers in its own brand.");
    const has = all.links.some((l) => l.assetId === assetId && l.offerId === offerId);
    if (has) {
      await db.delete(s.links).where(and(eq(s.links.assetId, assetId), eq(s.links.offerId, offerId)));
      await log(db, me.id, "unlinked", "asset", assetId, a.name, `from ${o.name}`);
    } else {
      await db.insert(s.links).values({ id: newId("lk"), assetId, offerId, createdBy: me.id }).onConflictDoNothing();
      await log(db, me.id, "linked", "asset", assetId, a.name, `to ${o.name}`);
    }
  });
}

/* ================================================================ CTAs */

const ctaDraft = z.object({
  id: z.string().optional(),
  brandId: z.string(),
  text: z.string().trim().min(1, "Write the button text.").max(80),
  url: str(1000).default(""),
  bg: z.string().default("#2D4A5C"),
  fg: z.string().default("#FFFFFF"),
  style: z.enum(["solid", "outline", "ghost"]).default("solid"),
});

export async function saveCta(input: z.input<typeof ctaDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, vis, db } = await context("edit");
    const d = ctaDraft.parse(input);
    need(vis.brand(d.brandId));
    const values = { brandId: d.brandId, text: d.text, url: d.url, bg: d.bg, fg: d.fg || onColor(d.bg), style: d.style };
    if (d.id) {
      need(vis.cta(d.id));
      await db.update(s.ctas).set({ ...values, updatedAt: new Date() }).where(eq(s.ctas.id, d.id));
      await log(db, me.id, "updated", "cta", d.id, d.text);
    } else {
      id = newId("ct");
      await db.insert(s.ctas).values({ id, ...values });
      await log(db, me.id, "created", "cta", id, d.text);
    }
    return ok(id);
  });
}

/* ================================================================ goals */

export async function saveGoal(input: { brandId: string; name: string; description?: string; original?: string }) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.brand(input.brandId));
    const nm = input.name.trim();
    if (!nm) throw new Denied("Give the goal a name.");
    const b = all.brands.find((x) => x.id === input.brandId)!;
    const goals = b.goals.map((g) => ({ ...g }));
    await db.transaction(async (tx) => {
      if (input.original) {
        const g = goals.find((x) => x.name === input.original);
        need(g, "That goal no longer exists.");
        if (nm !== input.original && goals.some((x) => x.name === nm)) throw new Denied("A goal with that name already exists. Merge them instead.");
        g!.name = nm;
        g!.description = input.description?.trim() ?? "";
        if (nm !== input.original) {
          for (const o of all.offers.filter((o) => o.brandId === b.id && o.goals.includes(input.original!))) {
            await tx.update(s.offers).set({ goals: o.goals.map((x) => (x === input.original ? nm : x)) }).where(eq(s.offers.id, o.id));
          }
        }
        await log(tx, me.id, "renamed goal", "brand", b.id, nm, input.original === nm ? "" : `${input.original} → ${nm}`);
      } else {
        if (goals.some((x) => x.name === nm)) throw new Denied("That goal already exists.");
        goals.push({ name: nm, description: input.description?.trim() ?? "" });
        await log(tx, me.id, "added goal", "brand", b.id, nm);
      }
      await tx.update(s.brands).set({ goals, updatedAt: new Date() }).where(eq(s.brands.id, b.id));
    });
  });
}

export async function mergeGoal(brandId: string, from: string, into: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.brand(brandId));
    if (!into || into === from) throw new Denied("Pick a goal to merge into.");
    const b = all.brands.find((x) => x.id === brandId)!;
    await db.transaction(async (tx) => {
      await tx.update(s.brands).set({ goals: b.goals.filter((g) => g.name !== from) }).where(eq(s.brands.id, brandId));
      for (const o of all.offers.filter((o) => o.brandId === brandId && o.goals.includes(from))) {
        const g = o.goals.map((x) => (x === from ? into : x));
        await tx.update(s.offers).set({ goals: g.filter((x, i) => g.indexOf(x) === i) }).where(eq(s.offers.id, o.id));
      }
      await log(tx, me.id, "merged goal", "brand", brandId, into, `${from} → ${into}`);
    });
  });
}

export async function deleteGoal(brandId: string, goal: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.brand(brandId));
    const b = all.brands.find((x) => x.id === brandId)!;
    await db.transaction(async (tx) => {
      await tx.update(s.brands).set({ goals: b.goals.filter((g) => g.name !== goal) }).where(eq(s.brands.id, brandId));
      for (const o of all.offers.filter((o) => o.brandId === brandId && o.goals.includes(goal))) {
        await tx.update(s.offers).set({ goals: o.goals.filter((x) => x !== goal) }).where(eq(s.offers.id, o.id));
      }
      await log(tx, me.id, "removed goal", "brand", brandId, goal);
    });
  });
}

/* ================================================================ people */

const personDraft = z.object({
  id: z.string().optional(),
  name: name("person"),
  email: z.string().trim().toLowerCase().email("That email address does not look right.").or(z.literal("")).optional(),
  role: str(80).default("Team member"),
  access: z.enum(["Admin", "Editor", "Reviewer", "Viewer"]),
  allClients: z.boolean().default(false),
  clientIds: z.array(z.string()).default([]),
  brandIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([]),
});

export async function savePerson(input: z.input<typeof personDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, db, all } = await context("access");
    const d = personDraft.parse(input);
    const email = d.email || null;
    if (email && all.users.some((u) => u.email === email && u.id !== d.id)) throw new Denied("Someone already uses that email address.");
    const values = {
      name: d.name, role: d.role, access: d.access, allClients: d.allClients, email,
      clientIds: d.allClients ? [] : d.clientIds, brandIds: d.allClients ? [] : d.brandIds, groupIds: d.allClients ? [] : d.groupIds,
    };
    if (d.id) {
      const target = all.users.find((u) => u.id === d.id);
      need(target, "That person no longer exists.");
      // Never leave the workspace without an admin.
      if (target!.access === "Admin" && d.access !== "Admin" && all.users.filter((u) => u.access === "Admin").length === 1) {
        throw new Denied("Someone has to stay an admin. Make another person an admin first.");
      }
      await db.update(s.users).set({ ...values, updatedAt: new Date() }).where(eq(s.users.id, d.id));
      await log(db, me.id, "changed access for", "person", d.id, d.name, d.access);
    } else {
      id = newId("u");
      const parts = d.name.split(/\s+/);
      const initials = ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
      await db.insert(s.users).values({ id, initials, ...values });
      await log(db, me.id, "invited", "person", id, d.name, d.access);
    }
    return ok(id);
  });
}

const groupDraft = z.object({
  id: z.string().optional(),
  name: name("group"),
  note: str(500).default(""),
  clientIds: z.array(z.string()).default([]),
  memberIds: z.array(z.string()).default([]),
});

export async function saveGroup(input: z.input<typeof groupDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, db, all } = await context("access");
    const d = groupDraft.parse(input);
    await db.transaction(async (tx) => {
      if (d.id) {
        await tx.update(s.groups).set({ name: d.name, note: d.note, clientIds: d.clientIds, updatedAt: new Date() }).where(eq(s.groups.id, d.id));
      } else {
        id = newId("g");
        await tx.insert(s.groups).values({ id: id!, name: d.name, note: d.note, clientIds: d.clientIds });
      }
      for (const u of all.users) {
        const inIt = u.groupIds.includes(id!);
        const want = d.memberIds.includes(u.id);
        if (inIt !== want) {
          await tx.update(s.users).set({ groupIds: want ? [...u.groupIds, id!] : u.groupIds.filter((g) => g !== id) }).where(eq(s.users.id, u.id));
        }
      }
      await log(tx, me.id, d.id ? "updated group" : "created group", "person", id!, d.name);
    });
    return ok(id);
  });
}

export async function deleteGroup(groupId: string) {
  return run(async () => {
    const { me, db, all } = await context("access");
    const g = all.groups.find((x) => x.id === groupId);
    need(g, "That group no longer exists.");
    await db.transaction(async (tx) => {
      for (const u of all.users.filter((u) => u.groupIds.includes(groupId))) {
        await tx.update(s.users).set({ groupIds: u.groupIds.filter((x) => x !== groupId) }).where(eq(s.users.id, u.id));
      }
      await tx.delete(s.groups).where(eq(s.groups.id, groupId));
      await log(tx, me.id, "deleted group", "person", groupId, g!.name);
    });
  });
}

/* ================================================================ archive / delete */

type Kind = "client" | "brand" | "service" | "offer" | "asset" | "cta" | "person";

export async function setArchived(kind: "client" | "brand" | "service" | "offer" | "asset", id: string, on: boolean) {
  return run(async () => {
    const { me, vis, db, all } = await context("archive");
    const table = { client: s.clients, brand: s.brands, service: s.services, offer: s.offers, asset: s.assets }[kind];
    const seen = { client: vis.client, brand: vis.brand, service: vis.service, offer: vis.offer, asset: vis.asset }[kind];
    need(seen(id));
    const label = ({ client: all.clients, brand: all.brands, service: all.services, offer: all.offers, asset: all.assets }[kind] as { id: string; name: string }[]).find((x) => x.id === id)?.name ?? "";
    await db.update(table).set({ archived: on, updatedAt: new Date() }).where(eq(table.id, id));
    await log(db, me.id, on ? "archived" : "restored", kind, id, label);
  });
}

async function deleteBrands(tx: Parameters<Parameters<DB["transaction"]>[0]>[0], all: All, brandIds: string[]) {
  if (!brandIds.length) return;
  const ids = new Set(brandIds);
  all.brands.filter((b) => b.parentId && ids.has(b.parentId)).forEach((b) => ids.add(b.id));
  const list = [...ids];
  const offerIds = all.offers.filter((o) => ids.has(o.brandId)).map((o) => o.id);
  const assetIds = all.assets.filter((a) => a.brandId && ids.has(a.brandId)).map((a) => a.id);
  if (offerIds.length) {
    await tx.delete(s.links).where(inArray(s.links.offerId, offerIds));
    await tx.delete(s.comments).where(and(eq(s.comments.kind, "offer"), inArray(s.comments.itemId, offerIds)));
  }
  if (assetIds.length) {
    await tx.delete(s.links).where(inArray(s.links.assetId, assetIds));
    await tx.delete(s.comments).where(and(eq(s.comments.kind, "asset"), inArray(s.comments.itemId, assetIds)));
    await tx.delete(s.assetVersions).where(inArray(s.assetVersions.assetId, assetIds));
  }
  await tx.delete(s.offers).where(inArray(s.offers.brandId, list));
  await tx.delete(s.assets).where(inArray(s.assets.brandId, list));
  await tx.delete(s.services).where(inArray(s.services.brandId, list));
  await tx.delete(s.ctas).where(inArray(s.ctas.brandId, list));
  await tx.delete(s.brands).where(inArray(s.brands.id, list));
}

export async function deleteItem(kind: Kind, id: string) {
  return run(async () => {
    const { me, vis, db, all } = await context(kind === "person" ? "access" : "del");
    await db.transaction(async (tx) => {
      switch (kind) {
        case "offer": {
          need(vis.offer(id));
          const o = all.offers.find((x) => x.id === id)!;
          await tx.delete(s.links).where(eq(s.links.offerId, id));
          await tx.delete(s.comments).where(and(eq(s.comments.kind, "offer"), eq(s.comments.itemId, id)));
          await tx.delete(s.offers).where(eq(s.offers.id, id));
          await log(tx, me.id, "deleted", "offer", id, o.name);
          break;
        }
        case "asset": {
          need(vis.asset(id));
          const a = all.assets.find((x) => x.id === id)!;
          await tx.delete(s.links).where(eq(s.links.assetId, id));
          await tx.delete(s.comments).where(and(eq(s.comments.kind, "asset"), eq(s.comments.itemId, id)));
          await tx.delete(s.assetVersions).where(eq(s.assetVersions.assetId, id));
          await tx.delete(s.assets).where(eq(s.assets.id, id));
          await log(tx, me.id, "deleted", "asset", id, a.name);
          break;
        }
        case "cta": {
          need(vis.cta(id));
          const c = all.ctas.find((x) => x.id === id)!;
          await tx.update(s.offers).set({ primaryCtaId: null }).where(eq(s.offers.primaryCtaId, id));
          await tx.update(s.offers).set({ secondaryCtaId: null }).where(eq(s.offers.secondaryCtaId, id));
          await tx.update(s.assets).set({ ctaId: null }).where(eq(s.assets.ctaId, id));
          await tx.delete(s.ctas).where(eq(s.ctas.id, id));
          await log(tx, me.id, "deleted", "cta", id, c.text);
          break;
        }
        case "service": {
          need(vis.service(id));
          const v = all.services.find((x) => x.id === id)!;
          await tx.update(s.offers).set({ serviceId: null }).where(eq(s.offers.serviceId, id));
          await tx.delete(s.services).where(eq(s.services.id, id));
          await log(tx, me.id, "deleted", "service", id, v.name);
          break;
        }
        case "brand": {
          need(vis.brand(id));
          const b = all.brands.find((x) => x.id === id)!;
          await deleteBrands(tx, all, [id]);
          await log(tx, me.id, "deleted", "brand", id, b.name);
          break;
        }
        case "client": {
          need(vis.client(id));
          const c = all.clients.find((x) => x.id === id)!;
          await deleteBrands(tx, all, all.brands.filter((b) => b.clientId === id).map((b) => b.id));
          await tx.delete(s.clients).where(eq(s.clients.id, id));
          await log(tx, me.id, "deleted", "client", id, c.name);
          break;
        }
        case "person": {
          const u = all.users.find((x) => x.id === id);
          need(u, "That person no longer exists.");
          if (id === me.id) throw new Denied("You cannot remove yourself.");
          if (u!.access === "Admin" && all.users.filter((x) => x.access === "Admin").length === 1) throw new Denied("Someone has to stay an admin.");
          await tx.delete(s.sessions).where(eq(s.sessions.userId, id));
          await tx.delete(s.users).where(eq(s.users.id, id));
          await log(tx, me.id, "removed", "person", id, u!.name);
          break;
        }
      }
    });
  });
}

/* ================================================================ status and review */

export async function setStatus(kind: "offer" | "asset", id: string, status: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    if (kind === "offer") {
      need(vis.offer(id));
      const st = z.enum(["Ideation", "Active", "Paused", "Archived"]).parse(status);
      const o = all.offers.find((x) => x.id === id)!;
      await db.update(s.offers).set({ status: st, updatedAt: new Date() }).where(eq(s.offers.id, id));
      await log(db, me.id, "changed status", "offer", id, o.name, `${o.status} → ${st}`);
    } else {
      need(vis.asset(id));
      const st = z.enum(["Draft", "Ready", "Live", "Archived"]).parse(status);
      const a = all.assets.find((x) => x.id === id)!;
      await db.update(s.assets).set({ status: st, updatedAt: new Date() }).where(eq(s.assets.id, id));
      await log(db, me.id, "changed status", "asset", id, a.name, `${a.status} → ${st}`);
    }
  });
}

function reviewTarget(kind: "offer" | "asset") {
  return kind === "offer" ? s.offers : s.assets;
}

export async function sendForReview(kind: "offer" | "asset", id: string, reviewerId: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("review");
    need(kind === "offer" ? vis.offer(id) : vis.asset(id));
    const reviewer = all.users.find((u) => u.id === reviewerId);
    need(reviewer && can(reviewer, "review"), "That person cannot review. Pick someone with Reviewer, Editor or Admin access.");
    const item = (kind === "offer" ? all.offers : all.assets).find((x) => x.id === id)!;
    const t = reviewTarget(kind);
    await db.update(t).set({ review: "In review", reviewerId, changeNote: "", updatedAt: new Date() }).where(eq(t.id, id));
    await log(db, me.id, `asked ${reviewer!.name.split(" ")[0]} to review`, kind, id, item.name);
  });
}

export async function approveItem(kind: "offer" | "asset", id: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("review");
    need(kind === "offer" ? vis.offer(id) : vis.asset(id));
    const item = (kind === "offer" ? all.offers : all.assets).find((x) => x.id === id)!;
    const t = reviewTarget(kind);
    const extra = kind === "asset" && (item as s.Asset).status === "Draft" ? { status: "Ready" as const } : {};
    await db.update(t).set({ review: "Approved", changeNote: "", reviewerId: me.id, updatedAt: new Date(), ...extra }).where(eq(t.id, id));
    await log(db, me.id, "approved", kind, id, item.name);
  });
}

export async function requestChanges(kind: "offer" | "asset", id: string, note: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("review");
    need(kind === "offer" ? vis.offer(id) : vis.asset(id));
    const text = note.trim();
    if (!text) throw new Denied("Say what needs to change, not just that something does.");
    const item = (kind === "offer" ? all.offers : all.assets).find((x) => x.id === id)!;
    const t = reviewTarget(kind);
    await db.transaction(async (tx) => {
      await tx.update(t).set({ review: "Changes requested", changeNote: text, reviewerId: me.id, updatedAt: new Date() }).where(eq(t.id, id));
      await tx.insert(s.comments).values({ id: newId("cm"), kind, itemId: id, userId: me.id, text, isChange: true, mentions: item.ownerId ? [item.ownerId] : [] });
      await log(tx, me.id, "requested changes on", kind, id, item.name, text);
    });
  });
}

/* ================================================================ discussion */

export async function postComment(kind: "offer" | "asset", itemId: string, text: string, refs: string[], mentions: string[]) {
  return run(async () => {
    const { me, vis, db, all } = await context("comment");
    need(kind === "offer" ? vis.offer(itemId) : vis.asset(itemId));
    const t = text.trim();
    if (!t) throw new Denied("Write something first.");
    if (t.length > 8000) throw new Denied("That note is too long. Split it up.");
    // Keep only the tags and mentions that survived editing.
    const keepRefs = [...new Set(refs)].filter((r) => vis.offer(r) && t.includes("#" + (all.offers.find((o) => o.id === r)?.name ?? "\u0000")));
    const keepMentions = [...new Set(mentions)].filter((m) => t.includes("@" + (all.users.find((u) => u.id === m)?.name ?? "\u0000")));
    await db.insert(s.comments).values({ id: newId("cm"), kind, itemId, userId: me.id, text: t, refs: keepRefs, mentions: keepMentions });
  });
}

export async function toggleResolve(commentId: string) {
  return run(async () => {
    const { vis, db, all } = await context("comment");
    const c = all.comments.find((x) => x.id === commentId);
    need(c && (c.kind === "offer" ? vis.offer(c.itemId) : vis.asset(c.itemId)));
    await db.update(s.comments).set({ resolved: !c!.resolved }).where(eq(s.comments.id, commentId));
  });
}

/* ================================================================ checklists */

async function editItems(assetId: string, perm: Perm, fn: (items: s.CheckItem[]) => s.CheckItem[]) {
  return run(async () => {
    const { vis, db, all } = await context(perm);
    need(vis.asset(assetId));
    const a = all.assets.find((x) => x.id === assetId)!;
    await db.update(s.assets).set({ items: fn((a.items ?? []).map((i) => ({ ...i }))) }).where(eq(s.assets.id, assetId));
  });
}

export async function toggleItem(assetId: string, index: number) {
  return editItems(assetId, "comment", (items) => { if (items[index]) items[index].done = !items[index].done; return items; });
}
export async function resetList(assetId: string) {
  return editItems(assetId, "comment", (items) => items.map((i) => ({ ...i, done: false })));
}
export async function addItem(assetId: string, text: string) {
  const t = text.trim();
  if (!t) return fail("Write the check first.");
  return editItems(assetId, "edit", (items) => [...items, { text: t.slice(0, 500), done: false }]);
}
export async function removeItem(assetId: string, index: number) {
  return editItems(assetId, "edit", (items) => items.filter((_, i) => i !== index));
}
export async function moveItem(assetId: string, index: number, dir: -1 | 1) {
  return editItems(assetId, "edit", (items) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return items;
    [items[index], items[j]] = [items[j], items[index]];
    return items;
  });
}

export async function toggleClientVisible(assetId: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.asset(assetId));
    const a = all.assets.find((x) => x.id === assetId)!;
    await db.update(s.assets).set({ clientVisible: !a.clientVisible, updatedAt: new Date() }).where(eq(s.assets.id, assetId));
    await log(db, me.id, a.clientVisible ? "held back" : "cleared to send", "asset", assetId, a.name);
  });
}

export async function removeFile(assetId: string, fileName: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.asset(assetId));
    const a = all.assets.find((x) => x.id === assetId)!;
    const gone = a.files.find((f) => f.name === fileName);
    await db.update(s.assets).set({ files: a.files.filter((f) => f.name !== fileName), updatedAt: new Date() }).where(eq(s.assets.id, assetId));
    await log(db, me.id, "removed a file from", "asset", assetId, a.name, fileName);
    // Keep the stored copy if an earlier version still points at it.
    if (gone?.key && !all.assets.some((x) => x.id !== assetId && x.files.some((f) => f.key === gone.key))) await removeStoredFile(gone.key);
  });
}

/* ================================================================ client share links */

export async function createShareLink(brandId: string, label: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(vis.brand(brandId));
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(18).toString("base64url");
    const b = all.brands.find((x) => x.id === brandId)!;
    await db.insert(s.shareLinks).values({ token, brandId, label: label.trim().slice(0, 80), createdBy: me.id });
    await log(db, me.id, "created a client link for", "brand", brandId, b.name, label.trim());
    return ok(token);
  });
}

export async function revokeShareLink(token: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    const [l] = await db.select().from(s.shareLinks).where(eq(s.shareLinks.token, token));
    need(l && vis.brand(l.brandId), "That link no longer exists.");
    await db.update(s.shareLinks).set({ revokedAt: new Date() }).where(eq(s.shareLinks.token, token));
    await log(db, me.id, "revoked a client link for", "brand", l.brandId, all.brands.find((b) => b.id === l.brandId)?.name ?? "", l.label);
  });
}

/* ================================================================ my profile */

export async function updateProfile(input: { name: string; role: string }) {
  return run(async () => {
    const me = await getViewer();
    if (!me) throw new Denied("You are signed out.");
    const name = input.name.trim().slice(0, 120);
    if (!name) throw new Denied("Your name cannot be empty.");
    const parts = name.split(/\s+/);
    const initials = ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
    const db = await getDb();
    await db.update(s.users).set({ name, initials, role: input.role.trim().slice(0, 80) || me.role, updatedAt: new Date() }).where(eq(s.users.id, me.id));
  });
}
