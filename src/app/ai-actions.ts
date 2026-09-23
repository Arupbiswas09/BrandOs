"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { can } from "@/lib/access";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";

const Drafts = z.object({
  options: z.array(z.object({
    headline: z.string(),
    body: z.string(),
    cta: z.string(),
    why: z.string().describe("One sentence on what this version leans on."),
  })),
});

export type CopyOption = z.infer<typeof Drafts>["options"][number];
type DraftResult = { ok: true; options: CopyOption[] } | { ok: false; error: string };

/**
 * Three copy options for an asset, written in its brand's voice from the
 * positioning, promise and proof of the offers it supports. Nothing is saved
 * until someone picks one.
 */
export async function draftCopy(assetId: string, steer: string): Promise<DraftResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "AI drafting is off. Set ANTHROPIC_API_KEY to turn it on." };
  const me = await getViewer();
  if (!me || !can(me, "edit")) return { ok: false, error: "Your access level does not allow editing copy." };
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const a = all.assets.find((x) => x.id === assetId);
  if (!a || !vis.asset(assetId) || !a.brandId) return { ok: false, error: "That asset is not here." };
  const b = all.brands.find((x) => x.id === a.brandId)!;
  const offerIds = new Set(all.links.filter((l) => l.assetId === a.id).map((l) => l.offerId));
  const offers = all.offers.filter((o) => offerIds.has(o.id));
  const cta = all.ctas.find((c) => c.id === a.ctaId);

  const brief = [
    `Brand: ${b.name} — ${b.tagline}`,
    `Voice and tone: ${b.voice || "not written down"}`,
    `Boilerplate: ${b.boilerplate || "none"}`,
    `Asset: ${a.name} (${a.type}, channel ${a.channel})${a.short ? ` — ${a.short}` : ""}`,
    a.specs && `Creative specs: ${a.specs}`,
    a.audienceNotes && `Audience notes: ${a.audienceNotes}`,
    cta && `Call to action button: "${cta.text}"`,
    a.copy?.headline && `Current copy:\nHeadline: ${a.copy.headline}\nBody: ${a.copy.body}\nCTA: ${a.copy.cta}`,
    offers.length
      ? "Offers this asset supports:\n" + offers.map((o) => `- ${o.name} (segment: ${o.segment})\n  Positioning: ${o.positioning}\n  Promise: ${o.promise}\n  Proof: ${o.proof}`).join("\n")
      : "It is not linked to any offer yet.",
    steer.trim() && `Direction from the team: ${steer.trim()}`,
  ].filter(Boolean).join("\n\n");

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(Drafts) },
      system:
        "You write marketing copy for an agency's clients. Follow the brand's voice exactly, use the proof points as written, and never invent numbers, results or claims the brief does not contain. " +
        "Fit the copy to the asset type and channel (an ad is short, a landing page can breathe). Write three distinct options, each a headline, body and CTA text. " +
        "If there is a CTA button in the brief, use its text for the CTA.",
      messages: [{ role: "user", content: brief }],
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "The model declined to write this one. Try different direction." };
    const out = res.parsed_output;
    if (!out?.options?.length) return { ok: false, error: "No usable drafts came back. Try again." };
    return { ok: true, options: out.options.slice(0, 3) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Too many requests right now. Try again in a minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `The AI service failed (${e.status}).` };
    console.error(e);
    return { ok: false, error: "Drafting failed. Try again." };
  }
}

/** Saves chosen copy as a new version of the asset. */
export async function useCopy(assetId: string, copy: { headline: string; body: string; cta: string }) {
  const me = await getViewer();
  if (!me || !can(me, "edit")) return { ok: false as const, error: "Your access level does not allow editing copy." };
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const a = all.assets.find((x) => x.id === assetId);
  if (!a || !vis.asset(assetId)) return { ok: false as const, error: "That asset is not here." };
  const db = await getDb();
  const { id: _i, createdAt: _c, ...snapshot } = a;
  await db.transaction(async (tx) => {
    await tx.insert(s.assetVersions).values({ id: "av" + crypto.randomUUID().slice(0, 10), assetId, version: a.version, data: snapshot, userId: me.id });
    await tx.update(s.assets).set({
      copy: { headline: copy.headline.slice(0, 1000), body: copy.body.slice(0, 8000), cta: copy.cta.slice(0, 200) },
      version: a.version + 1, updatedAt: new Date(),
    }).where(eq(s.assets.id, assetId));
    await tx.insert(s.activity).values({ id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: "updated", type: "asset", itemId: assetId, label: a.name, field: "Copy (AI draft)" });
  });
  refresh();
  return { ok: true as const };
}
