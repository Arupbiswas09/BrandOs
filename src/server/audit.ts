import "server-only";
import { headers } from "next/headers";
import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s, type DB } from "@/db";
import { EV, SECURITY, type AuditQuery } from "@/lib/audit";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Where the request came from, as the proxy in front of us reports it. Best effort only. */
export async function requestIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return (fwd || h.get("x-real-ip") || "").slice(0, 64);
  } catch {
    return "";
  }
}

/**
 * Writes an admin-only event to the audit trail (type "security", so it never
 * shows in the dashboard feed). Never throws: a failed audit write must not
 * stop someone signing in.
 */
export async function recordSecurity(
  e: { userId?: string | null; action: string; itemId?: string | null; label?: string; field?: string; withIp?: boolean },
  db?: Tx,
) {
  try {
    const ip = e.withIp ? await requestIp() : "";
    const field = [e.field, ip && `from ${ip}`].filter(Boolean).join(" · ").slice(0, 500);
    const conn = db ?? (await getDb());
    await conn.insert(s.activity).values({
      id: "ac" + crypto.randomUUID().replace(/-/g, "").slice(0, 10),
      userId: e.userId ?? "",
      action: e.action,
      type: SECURITY,
      itemId: e.itemId ?? e.userId ?? "",
      label: (e.label ?? "").slice(0, 300),
      field,
    });
  } catch (err) {
    console.error("Could not write to the audit log", err);
  }
}

const a = s.activity;

const ACCESS_SECURITY: string[] = [EV.changedPassword, EV.setPassword, EV.inviteLink, EV.resetLink, EV.setup];
const DELETIONS: string[] = ["deleted", "deleted group", "removed", "removed a file from", EV.deletedForever];
const SIGNINS: string[] = [EV.signedIn, EV.signInFailed, EV.signedOut, EV.resetRequested];
const EXPORTS: string[] = [EV.exported, EV.auditExported];

function kindWhere(kind: AuditQuery["kind"]): SQL | undefined {
  switch (kind) {
    case "access": return or(eq(a.type, "person"), and(eq(a.type, SECURITY), inArray(a.action, ACCESS_SECURITY)));
    case "deletions": return or(inArray(a.action, DELETIONS), and(eq(a.action, "restored"), eq(a.field, "from the recycle bin")));
    case "shares": return or(ilike(a.action, "%client link%"), inArray(a.action, ["held back", "cleared to send"]));
    case "signins": return and(eq(a.type, SECURITY), inArray(a.action, SIGNINS));
    case "exports": return and(eq(a.type, SECURITY), inArray(a.action, EXPORTS));
    default: return undefined;
  }
}

/** The WHERE clause for a set of filters. Dates are whole days in UTC. */
export function auditWhere(q: AuditQuery): SQL | undefined {
  const parts: (SQL | undefined)[] = [kindWhere(q.kind)];
  if (q.person) parts.push(eq(a.userId, q.person));
  if (q.from) parts.push(gte(a.createdAt, new Date(`${q.from}T00:00:00Z`)));
  if (q.to) parts.push(lt(a.createdAt, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000)));
  if (q.q) {
    const pat = `%${q.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    parts.push(or(ilike(a.label, pat), ilike(a.field, pat), ilike(a.action, pat), ilike(a.type, pat)));
  }
  const list = parts.filter((p): p is SQL => !!p);
  return list.length ? and(...list) : undefined;
}

export async function readAudit(q: AuditQuery, page: { limit: number; offset: number }) {
  const db = await getDb();
  const where = auditWhere(q);
  const [rows, [{ n }], users] = await Promise.all([
    db.select().from(a).where(where).orderBy(desc(a.createdAt), desc(a.id)).limit(page.limit).offset(page.offset),
    db.select({ n: count() }).from(a).where(where),
    db.select({ id: s.users.id, name: s.users.name, email: s.users.email, access: s.users.access }).from(s.users).orderBy(sql`lower(${s.users.name})`),
  ]);
  return { rows, total: Number(n), users };
}
