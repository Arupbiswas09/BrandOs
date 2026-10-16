import type { Asset, AssetFolder, Brand, Offer } from "@/db/schema";
import { can, canChange, scopeLabel, type Perm } from "./access";
import { ASSET_TYPES, GOAL_PALETTE, NEUTRAL, roleOf, type AssetCategory, type AssetRole } from "./constants";
import { searchWorkspace, type SearchHit } from "./search";
import { timeAgo } from "./time";
import type { PublicUser, Workspace } from "./types";
import { waitOn } from "./types";

export type QueueItem = {
  kind: "asset" | "offer";
  id: string;
  name: string;
  sub: string;
  who: string;
  verb: string;
  act: "review" | "change";
  note: string;
  ago: string;
  /** When it last moved: how long it has been waiting. */
  since: Date;
};

/** What one service (or a brand's standalone offers) holds, counted once for the brand home and the service page. */
export type ServiceStats = {
  offers: number;
  /** Offers still in Ideation. */
  drafts: number;
  leadMagnets: number;
  landingPages: number;
  /** Offers whose funnel board has anything on it. */
  funnels: number;
  automations: number;
  /** Distinct live assets linked to these offers. */
  assets: number;
  /** Things someone has to act on: assets or offers in review or sent back, and offers with nowhere for people to arrive. */
  attention: number;
  /** The most recent change to the service, its offers or their assets. */
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** One row of a service's funnels: where people arrive, which offers send them there, and what feeds and follows it. */
export type FunnelGroup = {
  /** The landing page or lead magnet; null for offers with no entry point. */
  entry: Asset | null;
  offers: Offer[];
  automations: Asset[];
  /** Ads, posts, emails, proof, thank-you pages and other resources around these offers. */
  resources: Asset[];
};

const UNKNOWN_USER: PublicUser = {
  id: "", name: "Unassigned", initials: "—", role: "", email: null, access: "Viewer", allClients: false, permOverrides: {}, uploadLimitMb: null, storageQuotaMb: null,
  clientIds: [], brandIds: [], groupIds: [], createdAt: new Date(0), updatedAt: new Date(0), hasPassword: false, twoFactor: false,
};

/**
 * Read-only view over a Workspace snapshot with the lookups every screen
 * needs. Built once per snapshot; cheap maps, no mutation.
 */
export class WS {
  readonly d: Workspace;
  private byId: {
    users: Map<string, PublicUser>;
    brands: Map<string, Brand>;
    offers: Map<string, Offer>;
    assets: Map<string, Asset>;
  };
  private linksByOffer = new Map<string, string[]>();
  private linksByAsset = new Map<string, string[]>();

  constructor(d: Workspace) {
    this.d = d;
    this.byId = {
      users: new Map(d.users.map((u) => [u.id, u])),
      brands: new Map(d.brands.map((b) => [b.id, b])),
      offers: new Map(d.offers.map((o) => [o.id, o])),
      assets: new Map(d.assets.map((a) => [a.id, a])),
    };
    for (const l of d.links) {
      (this.linksByOffer.get(l.offerId) ?? this.linksByOffer.set(l.offerId, []).get(l.offerId)!).push(l.assetId);
      (this.linksByAsset.get(l.assetId) ?? this.linksByAsset.set(l.assetId, []).get(l.assetId)!).push(l.offerId);
    }
  }

  /* ---------- identity ---------- */
  get me(): PublicUser { return this.user(this.d.meId); }
  can(p: Perm) { return can(this.me, p); }
  /** Whether I can change this particular item (contributors: only their own). */
  canChange(item?: { ownerId?: string | null } | null) { return canChange(this.me, item); }
  get isGuest() { return this.me.access === "Client"; }
  user(id: string | null | undefined): PublicUser { return (id && this.byId.users.get(id)) || UNKNOWN_USER; }
  first(id: string | null | undefined) { return this.user(id).name.split(" ")[0]; }
  ago(d: Date | string | number) { return timeAgo(d, this.d.now); }

  /* ---------- lookups ---------- */
  brand(id: string | null | undefined) { return (id && this.byId.brands.get(id)) || null; }
  client(id: string | null | undefined) { return this.d.clients.find((c) => c.id === id) ?? null; }
  offer(id: string | null | undefined) { return (id && this.byId.offers.get(id)) || null; }
  asset(id: string | null | undefined) { return (id && this.byId.assets.get(id)) || null; }
  service(id: string | null | undefined) { return this.d.services.find((v) => v.id === id) ?? null; }
  cta(id: string | null | undefined) { return this.d.ctas.find((c) => c.id === id) ?? null; }
  group(id: string) { return this.d.groups.find((g) => g.id === id) ?? null; }

  offersOf(bid: string) { return this.d.offers.filter((o) => o.brandId === bid); }
  assetsOf(bid: string) { return this.d.assets.filter((a) => a.brandId === bid); }
  servicesOf(bid: string) { return this.d.services.filter((v) => v.brandId === bid); }
  offersOfService(sid: string) { return this.d.offers.filter((o) => o.serviceId === sid); }
  standaloneOffers(bid: string) { return this.d.offers.filter((o) => o.brandId === bid && !o.serviceId); }
  subBrands(bid: string) { return this.d.brands.filter((b) => b.parentId === bid); }
  ctasOf(bid: string) { return this.d.ctas.filter((c) => c.brandId === bid); }

  linkedAssetIds(oid: string) { return this.linksByOffer.get(oid) ?? []; }
  /** Folders on one offer's page, and which folder a linked asset sits in there. */
  foldersOf(oid: string): AssetFolder[] { return this.d.folders.filter((f) => f.offerId === oid); }
  folderOf(oid: string, aid: string): string | null { return this.d.links.find((l) => l.offerId === oid && l.assetId === aid)?.folderId ?? null; }
  linkedAssets(oid: string) { return this.linkedAssetIds(oid).map((id) => this.asset(id)).filter(Boolean) as Asset[]; }
  linkedOfferIds(aid: string) { return this.linksByAsset.get(aid) ?? []; }
  linkedOffers(aid: string) { return this.linkedOfferIds(aid).map((id) => this.offer(id)).filter(Boolean) as Offer[]; }
  assetsOfService(sid: string) {
    const seen = new Set<string>();
    this.offersOfService(sid).forEach((o) => this.linkedAssetIds(o.id).forEach((a) => seen.add(a)));
    return [...seen].map((id) => this.asset(id)).filter(Boolean) as Asset[];
  }

  /* ---------- services: one set of numbers for every screen ---------- */

  /** The live offers of a service, or of a brand's standalone offers when `sid` is null. */
  serviceOffers(bid: string, sid: string | null): Offer[] {
    return this.d.offers.filter((o) => o.brandId === bid && (o.serviceId ?? null) === sid && !o.archived);
  }

  /** Distinct live assets linked to any of these offers, newest first. */
  assetsOfOffers(offers: Offer[]): Asset[] {
    const seen = new Set<string>();
    offers.forEach((o) => this.linkedAssetIds(o.id).forEach((a) => seen.add(a)));
    return [...seen].map((id) => this.asset(id)).filter((a): a is Asset => !!a && !a.archived)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }

  roleOf(a: Asset): AssetRole | null { return roleOf(a.type); }

  serviceStats(bid: string, sid: string | null): ServiceStats {
    const offers = this.serviceOffers(bid, sid);
    const assets = this.assetsOfOffers(offers);
    const pending = (r: string) => r === "In review" || r === "Changes requested";
    const noEntry = offers.filter((o) => !this.linkedAssets(o.id).some((a) => !a.archived && roleOf(a.type) === "entry")).length;
    const svc = sid ? this.service(sid) : null;
    const dated = [
      ...(svc ? [{ at: new Date(svc.updatedAt), by: svc.ownerId }] : []),
      ...offers.map((o) => ({ at: new Date(o.updatedAt), by: o.ownerId })),
      ...assets.map((a) => ({ at: new Date(a.updatedAt), by: a.ownerId })),
    ].sort((x, y) => +y.at - +x.at)[0];
    return {
      offers: offers.length,
      drafts: offers.filter((o) => o.status === "Ideation").length,
      leadMagnets: assets.filter((a) => a.type === "Lead magnet").length,
      landingPages: assets.filter((a) => a.type === "Landing page").length,
      funnels: offers.filter((o) => (o.funnel?.boxes?.length ?? 0) > 0).length,
      automations: assets.filter((a) => roleOf(a.type) === "automation").length,
      assets: assets.length,
      attention: assets.filter((a) => pending(a.review)).length + offers.filter((o) => pending(o.review)).length + noEntry,
      updatedAt: dated?.at ?? null,
      updatedBy: dated?.by ?? null,
    };
  }

  /**
   * A service's funnels grouped by where people arrive: each landing page or
   * lead magnet with the offers that point at it, the automations that follow
   * and the traffic and resources around them. Offers with no entry point come
   * last in their own group.
   */
  funnelGroups(offers: Offer[]): FunnelGroup[] {
    const groups = new Map<string, FunnelGroup>();
    const orphans: Offer[] = [];
    for (const o of offers) {
      const linked = this.linkedAssets(o.id).filter((a) => !a.archived);
      const entries = linked.filter((a) => roleOf(a.type) === "entry");
      if (!entries.length) { orphans.push(o); continue; }
      for (const e of entries) {
        const g = groups.get(e.id) ?? { entry: e, offers: [], automations: [], resources: [] };
        g.offers.push(o);
        groups.set(e.id, g);
      }
    }
    const fill = (g: FunnelGroup) => {
      const seen = new Set<string>();
      for (const o of g.offers) for (const a of this.linkedAssets(o.id)) {
        if (a.archived || seen.has(a.id) || a.id === g.entry?.id) continue;
        const role = roleOf(a.type);
        if (role === "entry") continue;
        seen.add(a.id);
        (role === "automation" ? g.automations : g.resources).push(a);
      }
      return g;
    };
    const out = [...groups.values()].map(fill);
    if (orphans.length) out.push(fill({ entry: null, offers: orphans, automations: [], resources: [] }));
    return out;
  }

  /* ---------- asset taxonomy ---------- */
  catOf(a: Asset): AssetCategory { return a.isTemplate ? "global" : (ASSET_TYPES[a.type]?.cat ?? "campaign"); }
  codeOf(a: Asset) { return ASSET_TYPES[a.type]?.code ?? "AST"; }
  campaignAssetsOf(bid: string) { return this.assetsOf(bid).filter((a) => this.catOf(a) === "campaign"); }
  /** The first uploaded raster image on an asset, as a preview URL. */
  previewOf(a: Asset): string | null {
    if (a.thumbnail?.url) return `${a.thumbnail.url}?inline=1`;
    const f = a.files.find((x) => x.url && /^image\/(png|jpe?g|gif|webp|avif)$/.test(x.type ?? ""));
    return f?.url ? `${f.url}?inline=1` : null;
  }
  colorOf(a: Asset) { return this.brand(a.brandId)?.primary ?? "#5E6C66"; }

  /* ---------- segments and goals ---------- */
  segColor(name: string, brandId?: string) {
    const lists = brandId ? [this.brand(brandId)] : this.d.brands;
    for (const b of lists) {
      const s = b?.segments.find((x) => x.name === name);
      if (s) return s.color;
    }
    return NEUTRAL;
  }
  goalColor(bid: string, name: string) {
    const i = (this.brand(bid)?.goals ?? []).findIndex((g) => g.name === name);
    return i >= 0 ? GOAL_PALETTE[i % GOAL_PALETTE.length] : NEUTRAL;
  }

  /* ---------- discussion ---------- */
  commentsOf(kind: string, id: string) { return this.d.comments.filter((c) => c.kind === kind && c.itemId === id); }
  openCount(kind: string, id: string) { return this.commentsOf(kind, id).filter((c) => !c.resolved).length; }
  mentionsOf(kind: string, id: string) {
    return this.d.comments.filter((c) => !c.resolved && !(c.kind === kind && c.itemId === id) && c.refs.includes(id));
  }

  /* ---------- review queue ---------- */
  queue(): QueueItem[] {
    const out: QueueItem[] = [];
    for (const a of this.d.assets) {
      if (a.archived) continue;
      const w = waitOn(a);
      if (!w) continue;
      out.push({
        kind: "asset", id: a.id, name: a.name,
        sub: `${a.brandId ? this.brand(a.brandId)?.name : "Global Library"} · ${a.type}`,
        who: w.who, verb: w.verb, act: w.act, note: a.changeNote, ago: this.ago(a.updatedAt), since: new Date(a.updatedAt),
      });
    }
    for (const o of this.d.offers) {
      if (o.archived) continue;
      const w = waitOn(o);
      if (!w) continue;
      out.push({
        kind: "offer", id: o.id, name: o.name, sub: `${this.brand(o.brandId)?.name} · Offer`,
        who: w.who, verb: w.verb, act: w.act, note: o.changeNote, ago: this.ago(o.updatedAt), since: new Date(o.updatedAt),
      });
    }
    // Whatever has waited longest comes first: what is stuck, not what is due.
    return out.sort((x, y) => +x.since - +y.since);
  }

  /**
   * Offer launch dates. BrandOS keeps these and nothing else with a date:
   * tasks and deadlines belong to ClickUp or Asana.
   */
  launches() {
    const items: { kind: "offer"; id: string; name: string; sub: string; at: Date; color: string; live: boolean }[] = [];
    for (const o of this.d.offers) if (o.dueAt && !o.archived) {
      const b = this.brand(o.brandId);
      items.push({ kind: "offer", id: o.id, name: o.name, sub: `${b?.name ?? ""} · ${o.segment}`, at: new Date(o.dueAt), color: b?.primary ?? NEUTRAL, live: o.status === "Active" });
    }
    return items.sort((x, y) => +x.at - +y.at);
  }

  scopeLabel(u: PublicUser) {
    return scopeLabel(u, {
      group: (id) => this.group(id) ?? undefined,
      client: (id) => this.client(id) ?? undefined,
      brand: (id) => this.brand(id) ?? undefined,
    });
  }

  /* ---------- search ---------- */

  /**
   * The one search: everything this person can see, best match first. The
   * index is built once per workspace snapshot (see src/lib/search.ts).
   */
  search(q: string, opts?: { owner?: string | null; limit?: number }): SearchHit[] {
    return searchWorkspace(this, q, opts);
  }
}

export const live = <T extends { archived: boolean }>(list: T[]) => list.filter((x) => !x.archived);
export const archivedOnly = <T extends { archived: boolean }>(list: T[]) => list.filter((x) => x.archived);
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
