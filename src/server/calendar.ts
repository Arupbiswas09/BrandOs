import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { toDateInput } from "@/lib/time";
import { makeVisibility, readAll, scopeFor } from "@/server/data";
import { appUrl } from "@/server/mail";
import { itemUrl } from "@/server/notify";

/*
 * Private calendar feeds. Each person can have one secret URL that calendar
 * apps subscribe to. The database keeps only a SHA-256 of the token.
 */

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const feedUrl = (token: string) => `${appUrl()}/api/calendar/${token}.ics`;

/** A new token for this person, replacing any earlier one. Returns the full URL, shown once. */
export async function issueFeed(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const db = await getDb();
  await db.insert(s.calendarFeeds).values({ userId, tokenHash: hashToken(token) })
    .onConflictDoUpdate({ target: s.calendarFeeds.userId, set: { tokenHash: hashToken(token), createdAt: new Date(), lastUsedAt: null } });
  return feedUrl(token);
}

export async function revokeFeed(userId: string) {
  const db = await getDb();
  await db.delete(s.calendarFeeds).where(eq(s.calendarFeeds.userId, userId));
}

/** The .ics text for a token, or null when the token is unknown or revoked. */
export async function feedFor(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null;
  const db = await getDb();
  const [feed] = await db.select().from(s.calendarFeeds).where(eq(s.calendarFeeds.tokenHash, hashToken(token)));
  if (!feed) return null;
  const all = await readAll();
  const me = all.users.find((u) => u.id === feed.userId);
  if (!me) return null;

  // Calendar apps poll often; recording every hit would be noise.
  if (!feed.lastUsedAt || Date.now() - +feed.lastUsedAt > 3600_000) {
    await db.update(s.calendarFeeds).set({ lastUsedAt: new Date() }).where(eq(s.calendarFeeds.userId, me.id));
  }

  const vis = makeVisibility(all, scopeFor(all, me.id));
  const brandName = (id: string | null) => (id ? all.brands.find((b) => b.id === id)?.name ?? "Brand" : "Global Library");
  const events: IcsEvent[] = [];
  for (const a of all.assets) {
    if (!a.dueAt || a.archived || !vis.asset(a.id)) continue;
    const brand = brandName(a.brandId);
    const url = itemUrl("asset", a.id);
    events.push({
      uid: `asset-${a.id}@brandos`,
      date: toDateInput(a.dueAt),
      summary: `[${brand}] ${a.name} — Due`,
      description: `${a.type} · ${a.status}${a.review !== "None" ? ` · ${a.review}` : ""}\n${url}`,
      url,
      stamp: a.updatedAt,
      alarm: a.status === "Live" ? undefined : `${a.name} is due tomorrow`,
    });
  }
  for (const o of all.offers) {
    if (!o.dueAt || o.archived || !vis.offer(o.id)) continue;
    const brand = brandName(o.brandId);
    const url = itemUrl("offer", o.id);
    events.push({
      uid: `offer-${o.id}@brandos`,
      date: toDateInput(o.dueAt),
      summary: `[${brand}] ${o.name} — Launch`,
      description: `Offer launch · ${o.status}${o.review !== "None" ? ` · ${o.review}` : ""}\n${url}`,
      url,
      stamp: o.updatedAt,
      alarm: o.status === "Active" ? undefined : `${o.name} launches tomorrow`,
    });
  }
  events.sort((x, y) => x.date.localeCompare(y.date));
  return buildCalendar(`BrandOS — ${me.name}`, events);
}
