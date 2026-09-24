import type { Metadata } from "next";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { Settings } from "@/components/pages/settings";
import type { SecurityInfo } from "@/components/pages/security";
import { describeDevice } from "@/lib/ua";
import { authMode, currentSessionId, requireViewer } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  return <Settings security={await securityInfo()} />;
}

/** Your signed-in devices and two-step status. Only in password mode. */
async function securityInfo(): Promise<SecurityInfo | null> {
  if (authMode() !== "password") return null;
  const me = await requireViewer();
  const db = await getDb();
  const [rows, [tf], sid] = await Promise.all([
    db.select().from(s.sessions)
      .where(and(eq(s.sessions.userId, me.id), gt(s.sessions.expiresAt, new Date())))
      .orderBy(desc(s.sessions.lastSeenAt)),
    db.select({ enabledAt: s.twoFactor.enabledAt, recoveryCodes: s.twoFactor.recoveryCodes }).from(s.twoFactor).where(eq(s.twoFactor.userId, me.id)),
    currentSessionId(),
  ]);
  return {
    hasPassword: !!me.passwordHash,
    twoFactor: !!tf?.enabledAt,
    recoveryLeft: tf?.enabledAt ? tf.recoveryCodes.length : 0,
    sessions: rows.map((r) => ({
      id: r.id,
      device: describeDevice(r.userAgent),
      ip: r.ip,
      createdAt: r.createdAt.getTime(),
      lastSeenAt: r.lastSeenAt.getTime(),
      current: r.id === sid,
    })),
  };
}
