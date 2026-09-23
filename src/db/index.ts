import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seed } from "./seed";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: Promise<DB> };
const holder = globalThis as unknown as { __brandos?: Holder };
holder.__brandos ??= {};

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  let db: DB;
  if (url) {
    // Hosted Postgres (Neon, Supabase, RDS...).
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 5, prepare: false });
    const pg = drizzle(client, { schema });
    await migrate(pg, { migrationsFolder });
    db = pg as unknown as DB;
  } else {
    // Zero-setup local database: Postgres compiled to WASM, stored in .data/
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    const pg = drizzle(client, { schema });
    await migrate(pg, { migrationsFolder });
    db = pg as unknown as DB;
  }

  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existing.length === 0 && process.env.BRANDOS_SEED !== "off") {
    await seed(db);
  }
  await ensureAdmin(db);
  return db;
}

/**
 * BRANDOS_ADMIN_EMAIL + BRANDOS_ADMIN_PASSWORD guarantee one admin who can
 * sign in on a fresh install. The password is only set if none exists yet.
 */
async function ensureAdmin(db: DB) {
  const email = process.env.BRANDOS_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BRANDOS_ADMIN_PASSWORD;
  if (!email || !password) return;
  const { hashPassword } = await import("@/server/password");
  const { eq } = await import("drizzle-orm");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!u) {
    const name = process.env.BRANDOS_ADMIN_NAME?.trim() || email.split("@")[0];
    const parts = name.split(/\s+/);
    await db.insert(schema.users).values({
      id: "u" + crypto.randomUUID().slice(0, 8), name, email, access: "Admin", allClients: true, role: "Account director",
      initials: ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase(), passwordHash: await hashPassword(password),
    });
  } else if (!u.passwordHash) {
    await db.update(schema.users).set({ passwordHash: await hashPassword(password), access: "Admin", allClients: true }).where(eq(schema.users.id, u.id));
  }
}

export function getDb(): Promise<DB> {
  holder.__brandos!.db ??= connect().catch((err) => {
    holder.__brandos!.db = undefined;
    throw err;
  });
  return holder.__brandos!.db;
}

export { schema };
