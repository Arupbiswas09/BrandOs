import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { endSession, startPending, startSession } from "@/server/session";

/** The confirmed two-step set-up for one person, or null when it is off. */
export async function enabledTwoFactor(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.twoFactor)
    .where(and(eq(s.twoFactor.userId, userId), isNotNull(s.twoFactor.enabledAt))).limit(1);
  return row ?? null;
}

/**
 * The first factor (password or Google) checked out. People with two-step
 * verification on go to the code screen; everyone else gets a session.
 * Returns where to send them next.
 */
export async function afterFirstFactor(userId: string): Promise<"/" | "/sign-in/verify"> {
  if (await enabledTwoFactor(userId)) {
    await startPending(userId);
    return "/sign-in/verify";
  }
  await endSession();
  await startSession(userId);
  return "/";
}
