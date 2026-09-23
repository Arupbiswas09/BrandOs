"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { DEFAULT_GOALS } from "@/lib/constants";
import { isHex } from "@/lib/color";
import { hashPassword } from "@/server/password";
import { authMode, startSession } from "@/server/session";

export type SetupState = { error?: string } | undefined;

/** Only ever works on an empty install: it creates the first admin and the agency's own brand. */
export async function completeSetup(_: SetupState, form: FormData): Promise<SetupState> {
  const agency = String(form.get("agency") ?? "").trim().slice(0, 120);
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const color = String(form.get("color") ?? "#2D4A5C");
  if (!agency) return { error: "Give the agency a name." };
  if (!name) return { error: "Tell us your name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "That email address does not look right." };
  if (authMode() === "password" && password.length < 10) return { error: "Use a password of at least ten characters." };

  const db = await getDb();
  const id = (p: string) => p + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const userId = id("u");
  const created = await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.users);
    if (n > 0) return false;
    const parts = name.split(/\s+/);
    await tx.insert(s.users).values({
      id: userId, name, email, role: "Account director", access: "Admin", allClients: true,
      initials: ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase(),
      passwordHash: password ? await hashPassword(password) : null,
    });
    const clientId = id("cl");
    await tx.insert(s.clients).values({ id: clientId, name: agency, kind: "Our agency", contactId: userId, since: String(new Date().getFullYear()), note: "Everything we sell lives here." });
    const primary = isHex(color) ? color : "#2D4A5C";
    await tx.insert(s.brands).values({
      id: id("br"), clientId, name: agency, mark: agency.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AG",
      tagline: "", primary, secondary: "#E8B44A", ownerId: userId,
      goals: DEFAULT_GOALS.map((g) => ({ ...g })), segments: [{ name: "All segments", color: "#6E7C76" }],
      colours: [{ name: "Primary", hex: primary, usage: "Buttons, links, headings." }],
    });
    return true;
  });
  if (!created) return { error: "This BrandOS is already set up. Sign in instead." };
  await startSession(userId);
  redirect("/");
}
