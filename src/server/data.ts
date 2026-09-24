import "server-only";
import { cache } from "react";
import { desc, isNotNull, ne } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { can, scopeOf, seesBrand, seesClient, type Scope } from "@/lib/access";
import { mailEnabled } from "@/server/mail";
import { slackEnabled } from "@/server/slack";
import type { PublicUser, Workspace } from "@/lib/types";
import { waitOn } from "@/lib/types";
import { SECURITY } from "@/lib/audit";

/**
 * Every table in one go. Agency data sets are small enough for this.
 * Server Actions call `readAll` (uncached) so that the re-render after a
 * mutation never sees a stale per-request copy; pages call `loadAll`.
 */
export async function readAll() {
  const db = await getDb();
  const [users, groups, clients, brands, services, offers, assets, ctas, links, comments, activity] = await Promise.all([
    db.select().from(s.users),
    db.select().from(s.groups),
    db.select().from(s.clients).orderBy(s.clients.createdAt),
    db.select().from(s.brands).orderBy(s.brands.createdAt),
    db.select().from(s.services).orderBy(s.services.createdAt),
    db.select().from(s.offers).orderBy(s.offers.createdAt),
    db.select().from(s.assets).orderBy(desc(s.assets.updatedAt)),
    db.select().from(s.ctas).orderBy(s.ctas.createdAt),
    db.select().from(s.links),
    db.select().from(s.comments).orderBy(s.comments.createdAt),
    // Sign-ins, password changes and exports live only in the admin audit log.
    db.select().from(s.activity).where(ne(s.activity.type, SECURITY)).orderBy(desc(s.activity.createdAt)).limit(400),
  ]);
  return { users, groups, clients, brands, services, offers, assets, ctas, links, comments, activity };
}

export const loadAll = cache(readAll);

export type All = Awaited<ReturnType<typeof readAll>>;

export function scopeFor(all: All, userId: string): Scope {
  const u = all.users.find((x) => x.id === userId);
  if (!u) return { all: false, clients: new Set(), brands: new Set(), guest: true };
  return scopeOf(u, all.groups);
}

/** Visibility of one item to one person, the same rule the UI uses. */
export function makeVisibility(all: All, scope: Scope) {
  const brandById = new Map(all.brands.map((b) => [b.id, b]));
  const brand = (id: string | null | undefined) => (id ? seesBrand(scope, brandById.get(id)) : false);
  const offerById = new Map(all.offers.map((o) => [o.id, o]));
  const assetById = new Map(all.assets.map((a) => [a.id, a]));
  const serviceById = new Map(all.services.map((v) => [v.id, v]));
  const ctaById = new Map(all.ctas.map((c) => [c.id, c]));
  // Client guests see only finished work that has been cleared for them.
  const offer = (id: string) => {
    const o = offerById.get(id);
    if (!o || !brand(o.brandId)) return false;
    return !scope.guest || (!o.archived && o.status !== "Ideation");
  };
  const asset = (id: string) => {
    const a = assetById.get(id);
    if (!a) return false;
    if (scope.guest) return !!a.brandId && a.clientVisible && !a.archived && brand(a.brandId);
    return !a.brandId || brand(a.brandId);
  };
  return {
    brand,
    client: (id: string) => seesClient(scope, id, all.brands),
    offer,
    asset,
    service: (id: string) => brand(serviceById.get(id)?.brandId),
    cta: (id: string) => brand(ctaById.get(id)?.brandId),
  };
}

function queueCounts(all: All): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of all.users) {
    const vis = makeVisibility(all, scopeOf(u, all.groups));
    let n = 0;
    for (const a of all.assets) {
      if (a.archived || !vis.asset(a.id)) continue;
      if (waitOn(a)?.who === u.id) n++;
    }
    for (const o of all.offers) {
      if (o.archived || !vis.offer(o.id)) continue;
      if (waitOn(o)?.who === u.id) n++;
    }
    out[u.id] = n;
  }
  return out;
}

export async function buildWorkspace(
  meId: string,
  extra: {
    recents: Workspace["recents"]; readIds: Set<string>; authMode: Workspace["authMode"]; shareLinks: Workspace["shareLinks"];
    calendarFeed: Workspace["calendarFeed"];
  },
): Promise<Workspace> {
  const all = await loadAll();
  const scope = scopeFor(all, meId);
  const vis = makeVisibility(all, scope);

  const guest = scope.guest;
  const db = await getDb();
  const withTwoFactor = new Set((await db.select({ id: s.twoFactor.userId }).from(s.twoFactor).where(isNotNull(s.twoFactor.enabledAt))).map((r) => r.id));
  // Guests get names and roles for the people they work with, never emails or access.
  const users: PublicUser[] = all.users
    .filter((u) => !guest || u.id === meId || u.access !== "Client")
    .map(({ passwordHash, notifyPrefs: _n, lastDigestAt: _l, ...u }) => (guest && u.id !== meId
      ? { ...u, email: null, clientIds: [], brandIds: [], groupIds: [], allClients: false, hasPassword: !!passwordHash, twoFactor: false }
      : { ...u, hasPassword: !!passwordHash, twoFactor: withTwoFactor.has(u.id) }));
  const offers = all.offers.filter((o) => vis.offer(o.id));
  const assets = all.assets.filter((a) => vis.asset(a.id));
  const offerIds = new Set(offers.map((o) => o.id));
  const assetIds = new Set(assets.map((a) => a.id));
  const comments = all.comments.filter((c) => (c.kind === "asset" ? assetIds.has(c.itemId) : offerIds.has(c.itemId)));

  const activity = guest ? [] : all.activity.filter((a) => {
    switch (a.type) {
      case "asset": return assetIds.has(a.itemId);
      case "offer": return offerIds.has(a.itemId);
      case "brand": return vis.brand(a.itemId);
      case "service": return vis.service(a.itemId);
      case "client": return vis.client(a.itemId);
      case "cta": return vis.cta(a.itemId);
      default: return true;
    }
  });

  const unreadMentions = comments
    .filter((c) => c.mentions.includes(meId) && c.userId !== meId && !c.resolved && !extra.readIds.has(c.id))
    .map((c) => c.id);

  return {
    now: Date.now(),
    meId,
    authMode: extra.authMode,
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
    uploadsEnabled: true,
    users,
    groups: guest ? [] : all.groups,
    clients: all.clients.filter((c) => vis.client(c.id)),
    brands: all.brands.filter((b) => vis.brand(b.id)),
    services: all.services.filter((v) => vis.brand(v.brandId)),
    offers,
    assets,
    ctas: all.ctas.filter((c) => vis.brand(c.brandId)),
    links: all.links.filter((l) => offerIds.has(l.offerId) && assetIds.has(l.assetId)),
    comments,
    activity,
    recents: extra.recents,
    shareLinks: guest ? [] : extra.shareLinks.filter((l) => vis.brand(l.brandId)),
    queueCounts: guest ? { [meId]: queueCounts(all)[meId] ?? 0 } : queueCounts(all),
    unreadMentions,
    notify: {
      prefs: all.users.find((u) => u.id === meId)?.notifyPrefs ?? {},
      mail: mailEnabled(),
      digest: !!process.env.CRON_SECRET?.trim(),
      slack: slackEnabled() && can(all.users.find((u) => u.id === meId), "access"),
    },
    calendarFeed: extra.calendarFeed,
  };
}
