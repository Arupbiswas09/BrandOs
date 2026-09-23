import "server-only";
import { inArray, lt } from "drizzle-orm";
import { removeStoredFile } from "./storage";
import { schema as s, type DB } from "@/db";
import type { All } from "./data";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Snapshot = Record<string, Record<string, unknown>[]>;
export type TrashKind = "client" | "brand" | "service" | "offer" | "asset" | "cta" | "person" | "group";

/** Table registry in the order rows must be restored (parents first). */
const TABLES = {
  clients: s.clients, brands: s.brands, services: s.services, ctas: s.ctas, offers: s.offers, assets: s.assets,
  links: s.links, comments: s.comments, assetVersions: s.assetVersions, shareLinks: s.shareLinks, users: s.users, groups: s.groups,
} as const;

const rows = <T extends object>(list: T[]) => list.map((r) => ({ ...r }) as Record<string, unknown>);

/**
 * Everything a delete will remove, captured before it goes. Also records
 * soft references (offers in a service, CTA uses, group members) so a
 * restore can reconnect them.
 */
export async function snapshot(db: Tx, all: All, kind: TrashKind, id: string): Promise<{ label: string; context: string; rows: Snapshot }> {
  const brandName = (bid: string | null | undefined) => all.brands.find((b) => b.id === bid)?.name ?? "";
  const out: Snapshot = {};
  const put = (k: keyof typeof TABLES | string, list: Record<string, unknown>[]) => { if (list.length) out[k] = [...(out[k] ?? []), ...list]; };
  const withAssets = async (assetIds: string[]) => {
    if (!assetIds.length) return;
    const ids = new Set(assetIds);
    put("assets", rows(all.assets.filter((a) => ids.has(a.id))));
    put("links", rows(all.links.filter((l) => ids.has(l.assetId))));
    put("comments", rows(all.comments.filter((c) => c.kind === "asset" && ids.has(c.itemId))));
    put("assetVersions", rows(await db.select().from(s.assetVersions).where(inArray(s.assetVersions.assetId, assetIds))));
  };
  const withOffers = (offerIds: string[]) => {
    const ids = new Set(offerIds);
    put("offers", rows(all.offers.filter((o) => ids.has(o.id))));
    put("links", rows(all.links.filter((l) => ids.has(l.offerId) && !(out.links ?? []).some((x) => x.id === l.id))));
    put("comments", rows(all.comments.filter((c) => c.kind === "offer" && ids.has(c.itemId))));
  };
  const withBrands = async (brandIds: string[]) => {
    const ids = new Set(brandIds);
    all.brands.filter((b) => b.parentId && ids.has(b.parentId)).forEach((b) => ids.add(b.id));
    put("brands", rows(all.brands.filter((b) => ids.has(b.id))));
    put("services", rows(all.services.filter((v) => ids.has(v.brandId))));
    put("ctas", rows(all.ctas.filter((c) => ids.has(c.brandId))));
    withOffers(all.offers.filter((o) => ids.has(o.brandId)).map((o) => o.id));
    await withAssets(all.assets.filter((a) => a.brandId && ids.has(a.brandId)).map((a) => a.id));
    if (brandIds.length) put("shareLinks", rows(await db.select().from(s.shareLinks).where(inArray(s.shareLinks.brandId, [...ids]))));
  };

  switch (kind) {
    case "offer": { const o = all.offers.find((x) => x.id === id)!; withOffers([id]); return { label: o.name, context: brandName(o.brandId), rows: out }; }
    case "asset": { const a = all.assets.find((x) => x.id === id)!; await withAssets([id]); return { label: a.name, context: a.brandId ? brandName(a.brandId) : "Global Library", rows: out }; }
    case "cta": {
      const c = all.ctas.find((x) => x.id === id)!;
      put("ctas", rows([c]));
      put("ctaRefs", [
        ...all.offers.filter((o) => o.primaryCtaId === id).map((o) => ({ table: "offers", id: o.id, field: "primaryCtaId" })),
        ...all.offers.filter((o) => o.secondaryCtaId === id).map((o) => ({ table: "offers", id: o.id, field: "secondaryCtaId" })),
        ...all.assets.filter((a) => a.ctaId === id).map((a) => ({ table: "assets", id: a.id, field: "ctaId" })),
      ]);
      return { label: c.text, context: brandName(c.brandId), rows: out };
    }
    case "service": {
      const v = all.services.find((x) => x.id === id)!;
      put("services", rows([v]));
      put("serviceOffers", all.offers.filter((o) => o.serviceId === id).map((o) => ({ id: o.id })));
      return { label: v.name, context: brandName(v.brandId), rows: out };
    }
    case "brand": { const b = all.brands.find((x) => x.id === id)!; await withBrands([id]); return { label: b.name, context: all.clients.find((c) => c.id === b.clientId)?.name ?? "", rows: out }; }
    case "client": {
      const c = all.clients.find((x) => x.id === id)!;
      put("clients", rows([c]));
      await withBrands(all.brands.filter((b) => b.clientId === id).map((b) => b.id));
      return { label: c.name, context: c.kind, rows: out };
    }
    case "person": { const u = all.users.find((x) => x.id === id)!; put("users", rows([u])); return { label: u.name, context: u.role, rows: out }; }
    case "group": {
      const g = all.groups.find((x) => x.id === id)!;
      put("groups", rows([g]));
      put("groupMembers", all.users.filter((u) => u.groupIds.includes(id)).map((u) => ({ id: u.id })));
      return { label: g.name, context: "Group", rows: out };
    }
  }
}

/** JSON turns dates into strings; turn them back before inserting. */
function revive(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = typeof v === "string" && /At$/.test(k) && !Number.isNaN(Date.parse(v)) ? new Date(v) : v;
  return o;
}

export async function restoreSnapshot(tx: Tx, snap: Snapshot, groupId?: string) {
  for (const [key, table] of Object.entries(TABLES)) {
    const list = snap[key];
    if (!list?.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows come back from JSON and match the table they were read from
    await tx.insert(table).values(list.map(revive) as any).onConflictDoNothing();
  }
  const { eq, isNull, and } = await import("drizzle-orm");
  for (const ref of (snap.ctaRefs ?? []) as { table: "offers" | "assets"; id: string; field: string }[]) {
    const t = ref.table === "offers" ? s.offers : s.assets;
    const col = (t as unknown as Record<string, Parameters<typeof isNull>[0]>)[ref.field];
    await tx.update(t).set({ [ref.field]: snap.ctas?.[0]?.id } as never).where(and(eq(t.id, ref.id), isNull(col)));
  }
  const svc = snap.services?.[0]?.id as string | undefined;
  for (const o of (snap.serviceOffers ?? []) as { id: string }[]) {
    if (svc) await tx.update(s.offers).set({ serviceId: svc }).where(and(eq(s.offers.id, o.id), isNull(s.offers.serviceId)));
  }
  if (groupId) {
    for (const m of (snap.groupMembers ?? []) as { id: string }[]) {
      const [u] = await tx.select({ groupIds: s.users.groupIds }).from(s.users).where(eq(s.users.id, m.id));
      if (u && !u.groupIds.includes(groupId)) await tx.update(s.users).set({ groupIds: [...u.groupIds, groupId] }).where(eq(s.users.id, m.id));
    }
  }
}

/** Storage keys of every file inside a snapshot, for when the bin is emptied. */
export function fileKeys(snap: Snapshot): string[] {
  return (snap.assets ?? []).flatMap((a) => ((a.files as { key?: string }[] | undefined) ?? []).map((f) => f.key).filter((k): k is string => !!k));
}

export const BIN_DAYS = 30;

/** Entries older than the retention window are removed, files included. */
export async function purgeExpiredTrash(db: DB) {
  const cutoff = new Date(Date.now() - BIN_DAYS * 86_400_000);
  const old = await db.select().from(s.trash).where(lt(s.trash.deletedAt, cutoff));
  if (!old.length) return;
  await db.delete(s.trash).where(lt(s.trash.deletedAt, cutoff));
  for (const k of old.flatMap((e) => fileKeys(e.rows))) await removeStoredFile(k);
}
