"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { DB } from "@/db";
import { seed } from "@/db/seed";
import { can, canChange, type Perm } from "@/lib/access";
import { DEFAULT_GOALS, ASSET_TYPES } from "@/lib/constants";
import { isHex, onColor } from "@/lib/color";
import { readAll, makeVisibility, scopeFor, type All } from "@/server/data";
import { authMode, endSession, getViewer, startSession } from "@/server/session";
import { removeStoredFile } from "@/server/storage";
import { fileKeys, restoreSnapshot, snapshot } from "@/server/trash";
import { appUrl } from "@/server/mail";
import { itemUrl, notifyPeople } from "@/server/notify";
import { postSlack, slackEnabled, slackEsc, slackLater, slackLink } from "@/server/slack";
import { issueFeed, revokeFeed } from "@/server/calendar";
import { NOTIFY_EVENTS } from "@/lib/notify";
import { href } from "@/lib/routes";
import { recordSecurity } from "@/server/audit";
import { EV } from "@/lib/audit";

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
  if (perm && !can(me, perm)) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
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

/** Contributors change only work they own; editors and up change anything they can see. */
function own(me: Parameters<typeof canChange>[0], item: { ownerId?: string | null } | undefined) {
  if (!canChange(me, item)) throw new Denied("Contributors can only change work they own. Ask its owner or an editor.");
}

function needAny(me: Parameters<typeof can>[0], ...perms: Perm[]) {
  if (!perms.some((p) => can(me, p))) throw new Denied("Your role does not allow that. Ask an admin if you need it.");
}

const str = (max = 5000) => z.string().trim().max(max);
const name = (what: string) => z.string().trim().min(1, `Give the ${what} a name.`).max(200);

/**
 * Emails people about something that happened, after the response is sent.
 * Each person's choices in Settings → Notifications decide instant, digest or off.
 */
const notify = notifyPeople;

/** Images the browser can show inline, so people can pin notes on them. */
const PROOFABLE = /^image\/(png|jpe?g|gif|webp|avif)$/;

/** "Item (Brand · kind)" with a link, for the team's Slack channel. */
function slackItem(all: All, kind: "offer" | "asset", item: { id: string; name: string; brandId: string | null }) {
  const brand = item.brandId ? all.brands.find((b) => b.id === item.brandId)?.name ?? "" : "Global Library";
  return `${slackLink(itemUrl(kind, item.id), item.name)} (${slackEsc(brand)} · ${kind})`;
}

/* ================================================================ session */

export async function signInAs(userId: string) {
  if (authMode() !== "demo") return fail("Demo sign-in is switched off.");
  const db = await getDb();
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId));
  if (!u) return fail("That person does not exist.");
  await endSession();
  await startSession(u.id);
  await recordSecurity({ userId: u.id, action: EV.signedIn, field: "demo mode", withIp: true });
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
    await recordSecurity({ userId, action: EV.signedIn, field: "demo mode, switched person", withIp: true });
  });
}

export async function signOut() {
  const me = await getViewer();
  if (me) await recordSecurity({ userId: me.id, action: EV.signedOut, label: me.email ?? me.name, withIp: true });
  await endSession();
  redirect("/sign-in");
}

export async function resetDemo() {
  return run(async () => {
    if (authMode() !== "demo") throw new Denied("Reset is only available in demo mode.");
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const t of [s.notificationQueue, s.calendarFeeds, s.twoFactor, s.loginAttempts, s.trash, s.shareLinks, s.links, s.comments, s.activity, s.recents, s.reads, s.assetVersions, s.assets, s.offers, s.ctas, s.services, s.brands, s.clients, s.groups, s.invites]) {
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
    const { me, vis, db } = await context("structure");
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

const colourSchema = z.object({
  name: str(80), hex: z.string().refine(isHex, "Colours must be hex values like #1F6F5C."), usage: str(300),
  role: z.enum(["Primary", "Secondary", "Accent", "Neutral", "Background", "Text"]).optional(),
  cmyk: str(40).optional(), pantone: str(40).optional(),
});
const fontSchema = z.object({ name: str(80), role: str(120), files: str(120), weights: str(80).optional(), fallback: str(160).optional(), source: str(300).optional() });
const list = (n = 30, len = 200) => z.array(str(len)).max(n).optional();
const kitSchema = z.object({
  mission: str(1000).optional(),
  values: list(), weAre: list(), weAreNot: list(), wordsUse: list(60, 80), wordsAvoid: list(60, 80),
  voiceExamples: z.array(z.object({ context: str(80), say: str(500), dont: str(500) })).max(20).optional(),
  typeScale: z.array(z.object({
    name: str(40).min(1), font: str(80), size: z.number().min(6).max(200), weight: z.number().min(100).max(900),
    lineHeight: z.number().min(0.8).max(3), tracking: z.number().min(-0.2).max(0.5).optional(), sample: str(200).optional(),
  })).max(16).optional(),
  logo: z.object({ clearSpace: str(300).optional(), minDigital: str(80).optional(), minPrint: str(80).optional(), notes: str(1000).optional(), misuse: list(20, 200) }).optional(),
  imagery: str(1500).optional(), imageryDo: list(), imageryDont: list(),
  dos: list(), donts: list(),
  version: str(40).optional(),
});

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
  colours: z.array(colourSchema).max(24).optional(),
  fonts: z.array(fontSchema).max(24).optional(),
  /** [from, to] pairs from the kit editor, so offers follow a renamed segment. */
  segmentRenames: z.array(z.tuple([str(80), str(80)])).max(24).optional(),
});

export async function saveBrand(input: z.input<typeof brandDraft>) {
  let id = input.id;
  return run(async () => {
    const { me, vis, db, all } = await context();
    const d = brandDraft.parse(input);
    // Setting a brand up is structure; its colours, fonts and voice are the kit.
    const structure = can(me, "structure");
    if (!d.id) need(structure, "Your role cannot add brands. Ask a manager.");
    else needAny(me, "structure", "kit");
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
      if (!structure) {
        // Kit editors keep the brand's identity as it is.
        Object.assign(patch, { name: before.name, tagline: before.tagline, mark: before.mark, description: before.description, clientId: before.clientId });
        d.clientId = before.clientId;
      }
      if (!can(me, "kit")) {
        Object.assign(patch, { primary: before.primary, secondary: before.secondary, voice: before.voice, boilerplate: before.boilerplate, colours: before.colours, fonts: before.fonts });
      }
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

const kitDraft = z.object({
  brandId: z.string(),
  voice: str().default(""),
  boilerplate: str().default(""),
  colours: z.array(colourSchema).max(24),
  fonts: z.array(fontSchema).max(24),
  segments: z.array(segmentSchema).max(24),
  segmentRenames: z.array(z.tuple([str(80), str(80)])).max(24).default([]),
  kit: kitSchema,
});

/** Everything in the Brand Kit editor, in one save. Managers and admins only. */
export async function saveKit(input: z.input<typeof kitDraft>) {
  return run(async () => {
    const { me, vis, db, all } = await context("kit");
    const d = kitDraft.parse(input);
    need(vis.brand(d.brandId));
    const b = all.brands.find((x) => x.id === d.brandId)!;
    const keep = new Set(d.segments.map((x) => x.name));
    const renamed = new Set(d.segmentRenames.map(([f]) => f));
    const orphaned = b.segments.filter((x) => x.name !== "All segments" && !keep.has(x.name) && !renamed.has(x.name))
      .filter((x) => all.offers.some((o) => o.brandId === b.id && o.segment === x.name));
    if (orphaned.length) throw new Denied(`Offers still use ${orphaned[0].name}. Move them before removing it.`);
    const primary = d.colours.find((c) => c.role === "Primary")?.hex ?? d.colours[0]?.hex ?? b.primary;
    const secondary = d.colours.find((c) => c.role === "Secondary" || c.role === "Accent")?.hex ?? d.colours[1]?.hex ?? b.secondary;
    await db.transaction(async (tx) => {
      await tx.update(s.brands).set({
        voice: d.voice, boilerplate: d.boilerplate, colours: d.colours, fonts: d.fonts,
        segments: withAllSegments(d.segments), kit: d.kit, primary, secondary, updatedAt: new Date(),
      }).where(eq(s.brands.id, b.id));
      for (const [from, to] of d.segmentRenames) {
        if (!from || !to || from === to || from === "All segments") continue;
        await tx.update(s.offers).set({ segment: to }).where(and(eq(s.offers.brandId, b.id), eq(s.offers.segment, from)));
      }
      await log(tx, me.id, "updated", "brand", b.id, b.name, "Brand Kit");
    });
  });
}

function withAllSegments(list: { name: string; color: string }[]) {
  const rest = list.filter((x) => x.name !== "All segments");
  return [...rest, { name: "All segments", color: "#475569" }];
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
    const { me, vis, db, all } = await context("edit");
    const d = serviceDraft.parse(input);
    need(vis.brand(d.brandId));
    if (d.id) {
      need(vis.service(d.id));
      own(me, all.services.find((v) => v.id === d.id));
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
  dueAt: z.string().nullable().optional(),
});

/** "2026-10-03" from a date input, or null to clear. Noon keeps it on the same day in every timezone. */
function dueFrom(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) throw new Denied("That date does not look right.");
  return d;
}

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
      ...(d.dueAt !== undefined && { dueAt: dueFrom(d.dueAt) }),
    };
    if (d.id) {
      need(vis.offer(d.id));
      own(me, all.offers.find((o) => o.id === d.id));
      if (me.access === "Contributor") delete (values as { ownerId?: string }).ownerId;
      await db.update(s.offers).set({ ...values, updatedAt: new Date() }).where(eq(s.offers.id, d.id));
      await log(db, me.id, "updated", "offer", d.id, d.name, "Details");
    } else {
      id = newId("of");
      await db.insert(s.offers).values({ id, ...values, ownerId: me.access === "Contributor" ? me.id : d.ownerId || me.id });
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
  dueAt: z.string().nullable().optional(),
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
    else need(can(me, "library"), "Only managers and admins can change the Global Library.");
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
      ...(d.dueAt !== undefined && { dueAt: dueFrom(d.dueAt) }),
    };
    await db.transaction(async (tx) => {
      if (d.id) {
        need(vis.asset(d.id));
        const before = all.assets.find((a) => a.id === d.id)!;
        own(me, before);
        if (!before.brandId) need(can(me, "library"), "Only managers and admins can change the Global Library.");
        if (d.status === "Live" && before.status !== "Live") need(can(me, "publish"), "Your role cannot mark work Live. Send it for review instead.");
        await tx.insert(s.assetVersions).values({ id: newId("av"), assetId: d.id, version: before.version, data: assetSnapshot(before), userId: me.id });
        await tx.update(s.assets).set({ ...values, version: before.version + 1, updatedAt: new Date() }).where(eq(s.assets.id, d.id));
        await tx.delete(s.links).where(eq(s.links.assetId, d.id));
        await log(tx, me.id, "updated", "asset", d.id, d.name, "Details");
      } else {
        id = newId("as");
        const type = ASSET_TYPES[d.type];
        if (d.status === "Live") need(can(me, "publish"), "Your role cannot mark work Live. Send it for review instead.");
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
    else need(can(me, "library"), "Only managers and admins can add to the Global Library.");
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
    own(me, current);
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
    own(me, a);
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
      own(me, { ownerId: null });
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
    const { me, vis, db, all } = await context();
    needAny(me, "structure", "kit");
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
    const { me, vis, db, all } = await context();
    needAny(me, "structure", "kit");
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
    const { me, vis, db, all } = await context();
    needAny(me, "structure", "kit");
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
  access: z.enum(["Admin", "Manager", "Editor", "Contributor", "Reviewer", "Viewer", "Client"]),
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
    // Guests never see every client.
    if (d.access === "Client") d.allClients = false;
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
      // Before → after, so the audit log shows exactly what changed.
      const was = target!;
      const scope = (u: { allClients: boolean; clientIds: string[]; brandIds: string[]; groupIds: string[] }) =>
        u.allClients ? "every client" : [...u.clientIds, ...u.brandIds, ...u.groupIds].sort().join(",");
      const changes = [
        was.access !== d.access ? `${was.access} → ${d.access}` : d.access,
        scope(was) !== scope(values) && "what they can see changed",
        (was.email ?? null) !== email && "email changed",
      ].filter(Boolean).join(" · ");
      await log(db, me.id, "changed access for", "person", d.id, d.name, changes);
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
      const snap = await snapshot(tx, all, "group", groupId);
      await tx.insert(s.trash).values({ id: newId("tr"), kind: "group", itemId: groupId, label: snap.label, context: snap.context, rows: snap.rows, deletedBy: me.id });
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
      // Everything about to go is copied into the recycle bin first.
      const exists = { offer: all.offers, asset: all.assets, cta: all.ctas, service: all.services, brand: all.brands, client: all.clients, person: all.users }[kind].some((x) => x.id === id);
      if (exists) {
        const snap = await snapshot(tx, all, kind, id);
        await tx.insert(s.trash).values({ id: newId("tr"), kind, itemId: id, label: snap.label, context: snap.context, rows: snap.rows, deletedBy: me.id });
      }
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
          await tx.delete(s.calendarFeeds).where(eq(s.calendarFeeds.userId, id));
          await tx.delete(s.notificationQueue).where(eq(s.notificationQueue.userId, id));
          await tx.delete(s.twoFactor).where(eq(s.twoFactor.userId, id));
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
      own(me, o);
      await db.update(s.offers).set({ status: st, updatedAt: new Date() }).where(eq(s.offers.id, id));
      await log(db, me.id, "changed status", "offer", id, o.name, `${o.status} → ${st}`);
    } else {
      need(vis.asset(id));
      const st = z.enum(["Draft", "Ready", "Live", "Archived"]).parse(status);
      const a = all.assets.find((x) => x.id === id)!;
      own(me, a);
      if (st === "Live") need(can(me, "publish"), "Your role cannot mark work Live. Send it for review instead.");
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
    const { me, vis, db, all } = await context("edit");
    need(kind === "offer" ? vis.offer(id) : vis.asset(id));
    const reviewer = all.users.find((u) => u.id === reviewerId);
    const item = (kind === "offer" ? all.offers : all.assets).find((x) => x.id === id)!;
    own(me, item);
    need(reviewer && can(reviewer, "review"), "That person cannot review. Pick someone whose role can approve.");
    // A client can only review what has been shared with them.
    need(reviewer!.access !== "Client" || makeVisibility(all, scopeFor(all, reviewer!.id))[kind](id), "That client cannot see this yet. Mark it visible to the client first.");
    const t = reviewTarget(kind);
    await db.update(t).set({ review: "In review", reviewerId, changeNote: "", updatedAt: new Date() }).where(eq(t.id, id));
    await log(db, me.id, `asked ${reviewer!.name.split(" ")[0]} to review`, kind, id, item.name);
    slackLater(`:eyes: *${slackEsc(me.name)}* asked *${slackEsc(reviewer!.name)}* to review ${slackItem(all, kind, item)}`);
    notify(all, "review", [reviewerId], (first) => ({
      subject: `${me.name.split(" ")[0]} asked you to review ${item.name}`,
      heading: `${item.name} is waiting on you`,
      body: `Hi ${first}, ${me.name} asked you to review this ${kind}. Approve it, or send it back with a note.`,
      action: { label: "Open it in BrandOS", href: itemUrl(kind, id) },
    }), me.id);
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
    slackLater(`:white_check_mark: *${slackEsc(me.name)}* approved ${slackItem(all, kind, item)}`);
    notify(all, "approved", [item.ownerId], (first) => ({
      subject: `${item.name} was approved`,
      heading: "Approved",
      body: `Good news, ${first}: ${me.name} approved ${item.name}.`,
      action: { label: "Open it in BrandOS", href: itemUrl(kind, id) },
    }), me.id);
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
    slackLater(`:leftwards_arrow_with_hook: *${slackEsc(me.name)}* requested changes on ${slackItem(all, kind, item)}\n>${slackEsc(text.slice(0, 280)).replace(/\n/g, "\n>")}`);
    notify(all, "changes", [item.ownerId], (first) => ({
      subject: `Changes requested on ${item.name}`,
      heading: `${item.name} needs changes`,
      body: `Hi ${first}, ${me.name} sent this back with a note:`,
      quote: text,
      action: { label: "Make the changes", href: itemUrl(kind, id) },
    }), me.id);
  });
}

/* ================================================================ discussion */

/** Where a proofing note sits: which uploaded image, and how far across and down it, in percent. */
export type Pin = { fileKey: string; x: number; y: number };

const pinSchema = z.object({
  fileKey: z.string().min(1).max(600),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
});

export async function postComment(kind: "offer" | "asset", itemId: string, text: string, refs: string[], mentions: string[], pin?: Pin | null) {
  return run(async () => {
    const { me, vis, db, all } = await context("comment");
    need(kind === "offer" ? vis.offer(itemId) : vis.asset(itemId));
    const t = text.trim();
    if (!t) throw new Denied("Write something first.");
    if (t.length > 8000) throw new Denied("That note is too long. Split it up.");
    // A pin has to land on an image that is really attached to this asset.
    let at: { fileKey: string; pinX: number; pinY: number } | null = null;
    if (pin) {
      const p = pinSchema.parse(pin);
      const a = kind === "asset" ? all.assets.find((x) => x.id === itemId) : undefined;
      need(a?.files.some((f) => f.key === p.fileKey && f.url && PROOFABLE.test(f.type ?? "")), "That image is no longer attached. Refresh and try again.");
      at = { fileKey: p.fileKey, pinX: Math.round(p.x * 100) / 100, pinY: Math.round(p.y * 100) / 100 };
    }
    // Keep only the tags and mentions that survived editing.
    const keepRefs = [...new Set(refs)].filter((r) => vis.offer(r) && t.includes("#" + (all.offers.find((o) => o.id === r)?.name ?? "\u0000")));
    const keepMentions = [...new Set(mentions)].filter((m) => t.includes("@" + (all.users.find((u) => u.id === m)?.name ?? "\u0000")));
    await db.insert(s.comments).values({ id: newId("cm"), kind, itemId, userId: me.id, text: t, refs: keepRefs, mentions: keepMentions, ...at });
    const where = (kind === "offer" ? all.offers : all.assets).find((x) => x.id === itemId)?.name ?? "";
    notify(all, "mention", keepMentions, (first) => ({
      subject: `${me.name.split(" ")[0]} mentioned you on ${where}`,
      heading: `${me.name} mentioned you`,
      body: `Hi ${first}, you were mentioned in the discussion on ${where}:`,
      quote: t.slice(0, 600),
      action: { label: "Reply in BrandOS", href: itemUrl(kind, itemId) },
    }), me.id);
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
    const { me, vis, db, all } = await context(perm);
    need(vis.asset(assetId));
    const a = all.assets.find((x) => x.id === assetId)!;
    if (perm === "edit") own(me, a);
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
    const { me, vis, db, all } = await context("share");
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
    own(me, a);
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
    const { me, vis, db, all } = await context("share");
    need(vis.brand(brandId));
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(18).toString("base64url");
    const b = all.brands.find((x) => x.id === brandId)!;
    await db.insert(s.shareLinks).values({ token, brandId, label: label.trim().slice(0, 80), createdBy: me.id });
    await log(db, me.id, "created a client link for", "brand", brandId, b.name, label.trim());
    // The link itself is a secret, so the channel gets the brand page, not the share URL.
    slackLater(`:link: *${slackEsc(me.name)}* created a client share link${label.trim() ? ` "${slackEsc(label.trim().slice(0, 80))}"` : ""} for ${slackLink(appUrl() + href.brand(brandId), b.name)}`);
    return ok(token);
  });
}

export async function revokeShareLink(token: string) {
  return run(async () => {
    const { me, vis, db, all } = await context("share");
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

/* ================================================================ notifications and integrations */

const modeSchema = z.enum(["instant", "digest", "off"]);
const prefsSchema = z.object(Object.fromEntries(NOTIFY_EVENTS.map(({ event }) => [event, modeSchema.optional()]))).strict();

/** My own email choices. Anyone signed in can change their own. */
export async function saveNotifyPrefs(input: s.NotifyPrefs) {
  return run(async () => {
    const me = await getViewer();
    if (!me) throw new Denied("You are signed out.");
    const prefs = prefsSchema.parse(input) as s.NotifyPrefs;
    const db = await getDb();
    await db.update(s.users).set({ notifyPrefs: { ...me.notifyPrefs, ...prefs }, updatedAt: new Date() }).where(eq(s.users.id, me.id));
  });
}

/** Admins check that the Slack channel is wired up. */
export async function sendSlackTest() {
  return run(async () => {
    const { me } = await context("access");
    if (!slackEnabled()) throw new Denied("Slack is not set up. Add SLACK_WEBHOOK_URL to the server's environment and restart.");
    const r = await postSlack(`:wave: Test from BrandOS, sent by *${slackEsc(me.name)}*. Review requests, approvals, change requests and new client links will appear here. ${slackLink(appUrl(), "Open BrandOS")}`);
    if (!r.ok) throw new Denied(r.error);
  });
}

/** A new private calendar link for me, replacing any earlier one. The URL comes back once, in `id`. */
export async function createCalendarFeed() {
  return run(async () => {
    const me = await getViewer();
    if (!me) throw new Denied("You are signed out.");
    return ok(await issueFeed(me.id));
  });
}

export async function revokeCalendarFeed() {
  return run(async () => {
    const me = await getViewer();
    if (!me) throw new Denied("You are signed out.");
    await revokeFeed(me.id);
  });
}

/* ================================================================ due dates */

export async function setDue(kind: "offer" | "asset", id: string, date: string | null) {
  return run(async () => {
    const { me, vis, db, all } = await context("edit");
    need(kind === "offer" ? vis.offer(id) : vis.asset(id));
    const t = kind === "offer" ? s.offers : s.assets;
    const item = (kind === "offer" ? all.offers : all.assets).find((x) => x.id === id)!;
    own(me, item);
    const dueAt = dueFrom(date) ?? null;
    await db.update(t).set({ dueAt, updatedAt: new Date() }).where(eq(t.id, id));
    await log(db, me.id, dueAt ? "set a due date on" : "cleared the due date on", kind, id, item.name, dueAt ? dueAt.toDateString() : "");
  });
}

export async function editComment(commentId: string, text: string) {
  return run(async () => {
    const { me, db, all } = await context("comment");
    const c = all.comments.find((x) => x.id === commentId);
    need(c, "That note no longer exists.");
    if (c!.userId !== me.id) throw new Denied("You can only edit your own notes.");
    const t = text.trim();
    if (!t) throw new Denied("A note cannot be empty. Delete it instead.");
    // Tags and mentions stay only while their text is still in the note.
    const refs = c!.refs.filter((r) => t.includes("#" + (all.offers.find((o) => o.id === r)?.name ?? "\u0000")));
    const mentions = c!.mentions.filter((m) => t.includes("@" + (all.users.find((u) => u.id === m)?.name ?? "\u0000")));
    await db.update(s.comments).set({ text: t.slice(0, 8000), refs, mentions, editedAt: new Date() }).where(eq(s.comments.id, commentId));
  });
}

export async function deleteComment(commentId: string) {
  return run(async () => {
    const { me, db, all } = await context("comment");
    const c = all.comments.find((x) => x.id === commentId);
    need(c, "That note no longer exists.");
    if (c!.userId !== me.id && !can(me, "del")) throw new Denied("Only the author or an admin can delete a note.");
    await db.delete(s.comments).where(eq(s.comments.id, commentId));
    await db.delete(s.reads).where(eq(s.reads.commentId, commentId));
  });
}

/* ================================================================ recycle bin */


export async function restoreFromTrash(entryId: string) {
  return run(async () => {
    const { me, db } = await context("del");
    const [e] = await db.select().from(s.trash).where(eq(s.trash.id, entryId));
    need(e, "That is no longer in the bin.");
    await db.transaction(async (tx) => {
      await restoreSnapshot(tx, e!.rows, e!.kind === "group" ? e!.itemId : undefined);
      await tx.delete(s.trash).where(eq(s.trash.id, entryId));
      await log(tx, me.id, "restored", e!.kind === "group" ? "person" : e!.kind, e!.itemId, e!.label, "from the recycle bin");
    });
  });
}

export async function deleteForever(entryId: string | "all") {
  return run(async () => {
    const { me, db } = await context("del");
    const list = entryId === "all" ? await db.select().from(s.trash) : await db.select().from(s.trash).where(eq(s.trash.id, entryId));
    need(list.length || entryId === "all", "That is no longer in the bin.");
    await db.transaction(async (tx) => {
      for (const e of list) {
        await tx.delete(s.trash).where(eq(s.trash.id, e.id));
        await log(tx, me.id, EV.deletedForever, e.kind === "group" ? "person" : e.kind, e.itemId, e.label, entryId === "all" ? "emptied the recycle bin" : "from the recycle bin");
      }
    });
    for (const k of list.flatMap((e) => fileKeys(e.rows))) await removeStoredFile(k);
  });
}

/* ================================================================ bulk asset actions */

export type BulkOp = "archive" | "restore" | "status" | "due" | "review" | "tag" | "clear" | "delete";
export type BulkPayload = { status?: "Draft" | "Ready" | "Live"; date?: string | null; reviewerId?: string; tag?: string };
export type BulkSkip = { id: string; reason: string };
export type BulkResult = { ok: true; done: number; skipped: BulkSkip[] } | { ok: false; error: string };

/** Which permission each bulk change needs, before looking at any one asset. */
const BULK_PERM: Record<BulkOp, Perm> = {
  archive: "archive", restore: "archive", status: "edit", due: "edit", review: "edit", tag: "edit", clear: "share", delete: "del",
};

const bulkInput = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1, "Pick at least one asset.").max(500, "That is too many at once. Do up to 500."),
  op: z.enum(["archive", "restore", "status", "due", "review", "tag", "clear", "delete"]),
  payload: z.object({
    status: z.enum(["Draft", "Ready", "Live"]).optional(),
    date: z.string().max(40).nullable().optional(),
    reviewerId: z.string().max(64).optional(),
    tag: str(40).optional(),
  }).default({}),
});

/**
 * One change applied to many assets. Every asset is checked on its own, the
 * same way the single-item action would check it: can this person see it,
 * does their role allow it, and (for contributors) do they own it. Whatever
 * passes is changed and logged; whatever does not comes back with a reason.
 */
export async function bulkAssets(ids: string[], op: BulkOp, payload: BulkPayload = {}): Promise<BulkResult> {
  let out: BulkResult = { ok: true, done: 0, skipped: [] };
  const r = await run(async () => {
    const d = bulkInput.parse({ ids, op, payload });
    const { me, vis, db, all } = await context(BULK_PERM[d.op]);
    const p = d.payload;
    if (d.op === "status") {
      need(p.status, "Pick a status.");
      if (p.status === "Live") need(can(me, "publish"), "Your role cannot mark work Live. Send it for review instead.");
    }
    if (d.op === "tag") need(p.tag, "Write the tag first.");
    const dueAt = d.op === "due" ? dueFrom(p.date ?? null) ?? null : null;
    const reviewer = d.op === "review" ? all.users.find((u) => u.id === p.reviewerId) : undefined;
    if (d.op === "review") need(reviewer && can(reviewer, "review"), "That person cannot review. Pick someone whose role can approve.");
    // A client can only review what has been shared with them.
    const reviewerVis = reviewer?.access === "Client" ? makeVisibility(all, scopeFor(all, reviewer.id)) : null;

    const skipped: BulkSkip[] = [];
    const sent: string[] = [];
    let done = 0;
    await db.transaction(async (tx) => {
      for (const id of [...new Set(d.ids)]) {
        const a = all.assets.find((x) => x.id === id);
        const skip = (reason: string) => skipped.push({ id, reason });
        if (!a || !vis.asset(id)) { skip("not visible to you"); continue; }
        // Changing content is ownership-bound, and the Global Library has its own gate.
        if (d.op === "status" || d.op === "due" || d.op === "review" || d.op === "tag") {
          if (!canChange(me, a)) { skip("not yours"); continue; }
          if (!a.brandId && !can(me, "library")) { skip("Global Library"); continue; }
        }
        switch (d.op) {
          case "archive":
          case "restore": {
            const on = d.op === "archive";
            if (a.archived === on) { skip(on ? "already archived" : "not archived"); continue; }
            await tx.update(s.assets).set({ archived: on, updatedAt: new Date() }).where(eq(s.assets.id, id));
            await log(tx, me.id, on ? "archived" : "restored", "asset", id, a.name);
            break;
          }
          case "status": {
            if (a.status === p.status) { skip(`already ${p.status}`); continue; }
            await tx.update(s.assets).set({ status: p.status!, updatedAt: new Date() }).where(eq(s.assets.id, id));
            await log(tx, me.id, "changed status", "asset", id, a.name, `${a.status} → ${p.status}`);
            break;
          }
          case "due": {
            await tx.update(s.assets).set({ dueAt, updatedAt: new Date() }).where(eq(s.assets.id, id));
            await log(tx, me.id, dueAt ? "set a due date on" : "cleared the due date on", "asset", id, a.name, dueAt ? dueAt.toDateString() : "");
            break;
          }
          case "review": {
            if (a.ownerId === reviewer!.id) { skip("they own it"); continue; }
            if (reviewerVis && !reviewerVis.asset(id)) { skip("client cannot see it"); continue; }
            await tx.update(s.assets).set({ review: "In review", reviewerId: reviewer!.id, changeNote: "", updatedAt: new Date() }).where(eq(s.assets.id, id));
            await log(tx, me.id, `asked ${reviewer!.name.split(" ")[0]} to review`, "asset", id, a.name);
            sent.push(a.name);
            break;
          }
          case "tag": {
            const tag = p.tag!;
            if (a.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) { skip("already tagged"); continue; }
            if (a.tags.length >= 30) { skip("too many tags"); continue; }
            await tx.update(s.assets).set({ tags: [...a.tags, tag], updatedAt: new Date() }).where(eq(s.assets.id, id));
            await log(tx, me.id, "tagged", "asset", id, a.name, tag);
            break;
          }
          case "clear": {
            if (!a.brandId) { skip("Global Library"); continue; }
            if (a.clientVisible) { skip("already cleared"); continue; }
            await tx.update(s.assets).set({ clientVisible: true, updatedAt: new Date() }).where(eq(s.assets.id, id));
            await log(tx, me.id, "cleared to send", "asset", id, a.name);
            break;
          }
          case "delete": {
            // Into the recycle bin first, exactly like a single delete.
            const snap = await snapshot(tx, all, "asset", id);
            await tx.insert(s.trash).values({ id: newId("tr"), kind: "asset", itemId: id, label: snap.label, context: snap.context, rows: snap.rows, deletedBy: me.id });
            await tx.delete(s.links).where(eq(s.links.assetId, id));
            await tx.delete(s.comments).where(and(eq(s.comments.kind, "asset"), eq(s.comments.itemId, id)));
            await tx.delete(s.assetVersions).where(eq(s.assetVersions.assetId, id));
            await tx.delete(s.assets).where(eq(s.assets.id, id));
            await log(tx, me.id, "deleted", "asset", id, a.name);
            break;
          }
        }
        done++;
      }
    });
    if (sent.length) {
      const by = me.name.split(" ")[0];
      notify(all, "review", [reviewer!.id], (first) => ({
        subject: sent.length === 1 ? `${by} asked you to review ${sent[0]}` : `${by} asked you to review ${sent.length} assets`,
        heading: sent.length === 1 ? `${sent[0]} is waiting on you` : `${sent.length} assets are waiting on you`,
        body: `Hi ${first}, ${me.name} asked you to review ${sent.slice(0, 12).join(", ")}${sent.length > 12 ? ` and ${sent.length - 12} more` : ""}. Approve them, or send them back with a note.`,
        action: { label: "Open your queue in BrandOS", href: `${appUrl()}/?inbox=1` },
      }), me.id);
    }
    out = { ok: true, done, skipped };
  });
  return r.ok ? out : r;
}
