import type { Asset, Brand, Offer } from "@/db/schema";
import { can, scopeLabel, type Perm } from "./access";
import { ASSET_TYPES, GOAL_PALETTE, NEUTRAL, type AssetCategory } from "./constants";
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
  dueAt: Date | null;
};

const UNKNOWN_USER: PublicUser = {
  id: "", name: "Unassigned", initials: "—", role: "", email: null, access: "Viewer", allClients: false,
  clientIds: [], brandIds: [], groupIds: [], createdAt: new Date(0), updatedAt: new Date(0), hasPassword: false,
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
  linkedAssets(oid: string) { return this.linkedAssetIds(oid).map((id) => this.asset(id)).filter(Boolean) as Asset[]; }
  linkedOfferIds(aid: string) { return this.linksByAsset.get(aid) ?? []; }
  linkedOffers(aid: string) { return this.linkedOfferIds(aid).map((id) => this.offer(id)).filter(Boolean) as Offer[]; }
  assetsOfService(sid: string) {
    const seen = new Set<string>();
    this.offersOfService(sid).forEach((o) => this.linkedAssetIds(o.id).forEach((a) => seen.add(a)));
    return [...seen].map((id) => this.asset(id)).filter(Boolean) as Asset[];
  }

  /* ---------- asset taxonomy ---------- */
  catOf(a: Asset): AssetCategory { return a.isTemplate ? "global" : (ASSET_TYPES[a.type]?.cat ?? "campaign"); }
  codeOf(a: Asset) { return ASSET_TYPES[a.type]?.code ?? "AST"; }
  campaignAssetsOf(bid: string) { return this.assetsOf(bid).filter((a) => this.catOf(a) === "campaign"); }
  colorOf(a: Asset) { return this.brand(a.brandId)?.primary ?? "#6C7B74"; }

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
        who: w.who, verb: w.verb, act: w.act, note: a.changeNote, ago: this.ago(a.updatedAt), dueAt: a.dueAt,
      });
    }
    for (const o of this.d.offers) {
      if (o.archived) continue;
      const w = waitOn(o);
      if (!w) continue;
      out.push({
        kind: "offer", id: o.id, name: o.name, sub: `${this.brand(o.brandId)?.name} · Offer`,
        who: w.who, verb: w.verb, act: w.act, note: o.changeNote, ago: this.ago(o.updatedAt), dueAt: o.dueAt,
      });
    }
    // Soonest deadline first; undated work after everything with a date.
    return out.sort((x, y) => (x.dueAt ? +new Date(x.dueAt) : Infinity) - (y.dueAt ? +new Date(y.dueAt) : Infinity));
  }

  /** Everything with a date on it that is still in play. */
  dated() {
    const items: { kind: "asset" | "offer"; id: string; name: string; sub: string; dueAt: Date; color: string; done: boolean }[] = [];
    for (const a of this.d.assets) if (a.dueAt && !a.archived) {
      const b = this.brand(a.brandId);
      items.push({ kind: "asset", id: a.id, name: a.name, sub: `${b?.name ?? "Global Library"} · ${a.type}`, dueAt: new Date(a.dueAt), color: b?.primary ?? NEUTRAL, done: a.status === "Live" });
    }
    for (const o of this.d.offers) if (o.dueAt && !o.archived) {
      const b = this.brand(o.brandId);
      items.push({ kind: "offer", id: o.id, name: o.name, sub: `${b?.name} · Offer launch`, dueAt: new Date(o.dueAt), color: b?.primary ?? NEUTRAL, done: o.status === "Active" });
    }
    return items.sort((x, y) => +x.dueAt - +y.dueAt);
  }

  scopeLabel(u: PublicUser) {
    return scopeLabel(u, {
      group: (id) => this.group(id) ?? undefined,
      client: (id) => this.client(id) ?? undefined,
      brand: (id) => this.brand(id) ?? undefined,
    });
  }

  /* ---------- search ---------- */
  search(q: string) {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const hit = (...v: (string | null | undefined)[]) => v.some((x) => (x ?? "").toLowerCase().includes(t));
    type Row = { kind: string; id: string; title: string; sub: string; code: string; color: string; archived: boolean };
    const out: Row[] = [];
    const arch = (x: { archived?: boolean }) => (x.archived ? "Archived · " : "");
    for (const c of this.d.clients) if (hit(c.name, c.kind)) out.push({ kind: "Client", id: c.id, title: c.name, sub: arch(c) + c.kind, code: "CL", color: NEUTRAL, archived: c.archived });
    for (const b of this.d.brands) if (hit(b.name, b.tagline)) out.push({ kind: "Brand", id: b.id, title: b.name, sub: `${arch(b)}${this.client(b.clientId)?.name} · ${b.tagline}`, code: b.mark, color: b.primary, archived: b.archived });
    for (const v of this.d.services) if (hit(v.name, v.short, v.description)) {
      const b = this.brand(v.brandId);
      out.push({ kind: "Service", id: v.id, title: v.name, sub: `${arch(v)}${b?.name} · ${this.offersOfService(v.id).length} offers`, code: "SVC", color: b?.primary ?? NEUTRAL, archived: v.archived });
    }
    for (const o of this.d.offers) if (hit(o.name, o.short, o.positioning, o.tags.join(" "))) {
      const b = this.brand(o.brandId);
      out.push({ kind: "Offer", id: o.id, title: o.name, sub: `${arch(o)}${b?.name} · ${o.segment}`, code: "OF", color: b?.primary ?? NEUTRAL, archived: o.archived });
    }
    for (const a of this.d.assets) if (hit(a.name, a.short, a.type, a.tags.join(" "), a.notes, a.copy?.headline, a.copy?.body)) {
      const b = this.brand(a.brandId);
      const n = this.linkedOfferIds(a.id).length;
      out.push({ kind: "Asset", id: a.id, title: a.name, sub: `${arch(a)}${b ? b.name : "Global Library"} · ${a.type}${n ? ` · ${n} offers` : ""}`, code: this.codeOf(a), color: b?.primary ?? NEUTRAL, archived: a.archived });
    }
    for (const c of this.d.ctas) if (hit(c.text, c.url)) {
      out.push({ kind: "CTA", id: c.id, title: c.text, sub: `${this.brand(c.brandId)?.name} · ${c.url}`, code: "CTA", color: c.bg === "transparent" ? c.fg : c.bg, archived: false });
    }
    // Archived things sink to the bottom; exact-prefix title matches rise.
    return out.sort((x, y) => Number(x.archived) - Number(y.archived) || Number(!x.title.toLowerCase().startsWith(t)) - Number(!y.title.toLowerCase().startsWith(t)));
  }
}

export const live = <T extends { archived: boolean }>(list: T[]) => list.filter((x) => !x.archived);
export const archivedOnly = <T extends { archived: boolean }>(list: T[]) => list.filter((x) => x.archived);
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
