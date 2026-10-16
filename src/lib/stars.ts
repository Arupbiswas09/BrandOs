import type { Star } from "@/db/schema";
import { NEUTRAL } from "./constants";
import { href } from "./routes";
import type { WS } from "./ws";

/*
 * Starred items: the handful of things one person keeps at hand. Stars are a
 * personal preference, so they are never logged and never shown to anyone
 * else. Pure, so the sidebar, the dashboard and the server agree.
 */

export type StarKind = Star["kind"];
export const STAR_KINDS = ["client", "brand", "service", "offer", "asset"] as const satisfies readonly StarKind[];
/** The most one person may star. The sidebar shows the first NAV_STARS of them. */
export const MAX_STARS = 30;
export const NAV_STARS = 10;

export const starKey = (kind: string, id: string) => `${kind}:${id}`;

export type StarredItem = {
  key: string;
  kind: StarKind;
  id: string;
  name: string;
  /** The short code on the tile: a brand's mark, an asset type's code, OF, SVC or CL. */
  code: string;
  color: string;
  /** What it is and where it lives: "Offer · Quokka For Good". */
  sub: string;
  /** The page it opens; null for assets, which open in the drawer. */
  href: string | null;
};

/** One star as something to show, or null when it is archived or no longer visible. */
export function starredItem(ws: WS, kind: StarKind, id: string): StarredItem | null {
  const key = starKey(kind, id);
  switch (kind) {
    case "client": {
      const c = ws.client(id);
      return c && !c.archived ? { key, kind, id, name: c.name, code: "CL", color: NEUTRAL, sub: c.kind ? `Client · ${c.kind}` : "Client", href: href.client(c.id) } : null;
    }
    case "brand": {
      const b = ws.brand(id);
      if (!b || b.archived) return null;
      const parent = ws.brand(b.parentId);
      const where = parent ? `Sub-brand of ${parent.name}` : `Brand · ${ws.client(b.clientId)?.name ?? "No client"}`;
      return { key, kind, id, name: b.name, code: b.mark, color: b.primary, sub: where, href: href.brand(b.id) };
    }
    case "service": {
      const v = ws.service(id);
      if (!v || v.archived) return null;
      const b = ws.brand(v.brandId);
      return { key, kind, id, name: v.name, code: "SVC", color: b?.primary ?? NEUTRAL, sub: `Service · ${b?.name ?? "No brand"}`, href: href.service(v.id) };
    }
    case "offer": {
      const o = ws.offer(id);
      if (!o || o.archived) return null;
      const b = ws.brand(o.brandId);
      const sv = ws.service(o.serviceId);
      return { key, kind, id, name: o.name, code: "OF", color: b?.primary ?? NEUTRAL, sub: ["Offer", b?.name, sv?.name].filter(Boolean).join(" · "), href: href.offer(o.id) };
    }
    case "asset": {
      const a = ws.asset(id);
      if (!a || a.archived) return null;
      const b = ws.brand(a.brandId);
      return { key, kind, id, name: a.name, code: ws.codeOf(a), color: b?.primary ?? NEUTRAL, sub: `${a.type} · ${b?.name ?? "Global Library"}`, href: null };
    }
  }
}

/**
 * My stars in the order I added them, as things to show. `pending` holds
 * stars being added or taken away right now, before the server has answered.
 */
export function starredItems(ws: WS, pending: ReadonlyMap<string, boolean> = new Map()): StarredItem[] {
  const keys = ws.d.stars.map((s) => ({ kind: s.kind, id: s.itemId, key: starKey(s.kind, s.itemId) }));
  const have = new Set(keys.map((k) => k.key));
  for (const [key, on] of pending) {
    if (!on || have.has(key)) continue;
    const [kind, id] = key.split(":") as [StarKind, string];
    keys.push({ kind, id, key });
  }
  return keys
    .filter((k) => pending.get(k.key) !== false)
    .map((k) => starredItem(ws, k.kind, k.id))
    .filter((x): x is StarredItem => !!x);
}

/** Whether I have starred this, as the last snapshot says. */
export function isStarred(ws: WS, kind: string, id: string): boolean {
  return ws.d.stars.some((s) => s.kind === kind && s.itemId === id);
}
