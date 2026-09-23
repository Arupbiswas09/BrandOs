import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

/** Resolves a live share link to its brand and the assets cleared to send. */
export async function loadShare(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const db = await getDb();
  const [link] = await db.select().from(s.shareLinks).where(and(eq(s.shareLinks.token, token), isNull(s.shareLinks.revokedAt)));
  if (!link) return null;
  const [brand] = await db.select().from(s.brands).where(eq(s.brands.id, link.brandId));
  if (!brand || brand.archived) return null;
  const assets = (await db.select().from(s.assets).where(and(eq(s.assets.brandId, brand.id), eq(s.assets.clientVisible, true), eq(s.assets.archived, false))))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ctas = await db.select().from(s.ctas).where(eq(s.ctas.brandId, brand.id));
  return { link, brand, assets, ctas };
}
