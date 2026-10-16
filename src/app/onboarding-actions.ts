"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { can } from "@/lib/access";
import { isHex } from "@/lib/color";
import { SEGMENT_PALETTE } from "@/lib/constants";
import { checkBatch } from "@/lib/upload-policy";
import { ScanError, colourName, type SiteDraft } from "@/lib/site-draft";
import { readAll } from "@/server/data";
import { getUploadPolicy, myLimits } from "@/server/limits";
import { SafeFetchError, normaliseUrl } from "@/server/safe-fetch";
import { getViewer } from "@/server/session";
import { fetchLogo, scanSite } from "@/server/site-scan";
import { humanSize, saveFile, storageProblem } from "@/server/storage";
import { isThrottled, recordFailure } from "@/server/throttle";
import { checkUpload } from "@/server/uploads";
import { saveAsset, saveBrand, saveClient, saveService } from "./actions";

/*
 * "Start a brand from its website". Scanning only reads; nothing is saved
 * until the person has checked the draft and pressed Create brand, which
 * goes through the same actions as the brand, client and service forms
 * (saveClient, saveBrand, saveService, saveAsset), so their rules apply.
 */

export type ScanResult = { ok: true; draft: SiteDraft } | { ok: false; error: string };
export type CreateResult = { ok: true; id: string; notes: string[] } | { ok: false; error: string };

/** Scans per person per 15 minutes, so the server is never anyone's crawler. */
const SCANS_PER_WINDOW = 20;

function fetchMessage(e: SafeFetchError): string {
  switch (e.code) {
    case "invalid-url": return e.message;
    case "blocked": return "That address is on a private network, so BrandOS will not open it.";
    case "timeout": return "The site took too long to answer. Try again, or fill the brand in by hand.";
    case "too-many-redirects": return "The site redirected too many times. Try its full address.";
    default: return "BrandOS could not reach that site. Check the address and try again.";
  }
}

export async function scanWebsite(url: string): Promise<ScanResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "You are signed out. Sign in again to keep working." };
  if (!can(me, "structure")) return { ok: false, error: "Your role cannot add brands. Ask a manager." };
  if (typeof url !== "string" || !url.trim() || url.length > 2000) return { ok: false, error: "Paste the address of the brand's website." };
  const key = `site-scan:${me.id}`;
  if (await isThrottled([[key, SCANS_PER_WINDOW]])) return { ok: false, error: "That is a lot of scans in a short time. Wait a few minutes and try again." };
  try {
    // Only addresses worth opening count towards the limit.
    normaliseUrl(url);
    await recordFailure([key]);
    return { ok: true, draft: await scanSite(url) };
  } catch (e) {
    if (e instanceof SafeFetchError) return { ok: false, error: fetchMessage(e) };
    if (e instanceof ScanError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "The scan did not finish. Try again in a moment, or fill the brand in by hand." };
  }
}

const str = (max: number) => z.string().trim().max(max);
const hex = z.string().refine(isHex, "Colours must be hex values like #1F6F5C.");
const draftInput = z.object({
  clientId: z.string().max(64).nullable().optional(),
  newClientName: str(200).optional(),
  name: z.string().trim().min(1, "Give the brand a name.").max(200),
  tagline: str(200).default(""),
  description: str(5000).default(""),
  voice: str(5000).default(""),
  primary: hex,
  secondary: hex,
  /** Every colour to keep, primary and secondary included. */
  colours: z.array(z.object({ hex, name: str(80).optional() })).max(12),
  fonts: z.array(z.object({ name: z.string().trim().min(1).max(80), role: str(120).default(""), weights: str(80).default(""), source: str(300).default(""), fallback: str(160).default("") })).max(8),
  /** The chosen logo: an http(s) address from the scan, or an inline drawing as a data: URL. */
  logoUrl: z.string().max(600_000).nullable().optional(),
  services: z.array(z.object({ name: z.string().trim().min(1).max(200), short: str(200).default("") })).max(12),
  segments: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  website: str(2000).optional(),
}).refine((d) => !!d.clientId !== !!d.newClientName, "Pick a client, or name a new one.");

export type BrandDraftInput = z.input<typeof draftInput>;

/** Creates the client (if new), the brand with its colours, fonts and voice, its services and its logo. Returns the brand's id. */
export async function createBrandFromDraft(input: BrandDraftInput): Promise<CreateResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "You are signed out. Sign in again to keep working." };
  if (!can(me, "structure")) return { ok: false, error: "Your role cannot add brands. Ask a manager." };
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Something in the draft is not right." };
  const d = parsed.data;
  const logo = d.logoUrl?.trim() || null;
  if (logo && !/^https?:\/\//i.test(logo) && !/^data:image\/(svg\+xml|png|jpeg|gif|webp);base64,/i.test(logo)) return { ok: false, error: "That logo address cannot be used." };

  let clientId = d.clientId ?? null;
  let newClient = false;
  if (!clientId) {
    const c = await saveClient({ name: d.newClientName! });
    if (!c.ok) return c;
    clientId = c.id!;
    newClient = true;
  }

  // Primary and secondary first, the rest after, each once.
  const seen = new Set<string>();
  const colours = [
    { hex: d.primary, role: "Primary" as const },
    { hex: d.secondary, role: "Secondary" as const },
    ...d.colours.map((c) => ({ hex: c.hex, role: "Accent" as const, name: c.name })),
  ].filter((c) => {
    const k = c.hex.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12).map((c) => ({
    name: ("name" in c && c.name) || colourName(c.hex),
    hex: c.hex.toUpperCase(),
    usage: c.role === "Primary" ? "Buttons, links and headings. Taken from the website." : c.role === "Secondary" ? "Emphasis. Taken from the website." : "Taken from the website.",
    role: c.role,
  }));
  const fonts = d.fonts.map((f) => ({ name: f.name, role: f.role, files: "", weights: f.weights, fallback: f.fallback, source: f.source }));

  const b = await saveBrand({
    clientId, name: d.name, tagline: d.tagline, description: d.description, voice: d.voice,
    primary: d.primary.toUpperCase(), secondary: d.secondary.toUpperCase(), colours, fonts,
    segments: d.segments.map((name, i) => ({ name, color: SEGMENT_PALETTE[i % SEGMENT_PALETTE.length] })),
  });
  if (!b.ok) return { ok: false, error: newClient ? `${b.error} The client was created, so pick it next time.` : b.error };
  const brandId = b.id!;

  const notes: string[] = [];
  for (const sv of d.services) {
    const r = await saveService({ brandId, name: sv.name, short: sv.short });
    if (!r.ok) notes.push(`${sv.name} was not added: ${r.error}`);
  }
  if (logo) {
    const why = await addLogo(me, brandId, d.name, logo);
    if (why) notes.push(why);
  }
  refresh();
  return { ok: true, id: brandId, notes };
}

type Me = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

/** Downloads the chosen logo into a new Logo asset on the brand. Returns why not, if it could not. */
async function addLogo(me: Me, brandId: string, brandName: string, url: string): Promise<string | null> {
  if (!can(me, "upload")) return "The logo was not saved because uploading is switched off for you.";
  const problem = storageProblem();
  if (problem) return `The logo was not saved. ${problem}`;
  let file: Awaited<ReturnType<typeof fetchLogo>>;
  try {
    file = await fetchLogo(url);
  } catch (e) {
    const why = e instanceof ScanError ? e.message : e instanceof SafeFetchError ? fetchMessage(e) : "It could not be downloaded.";
    return `The logo was not saved. ${why} Add it from the brand's assets.`;
  }
  const base = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "brand";
  const fileName = `${base}-logo.${file.ext}`;
  const checked = checkUpload(fileName, file.type);
  if (!checked.ok) return `The logo was not saved. ${checked.error}`;
  const limit = checkBatch([{ name: fileName, size: file.bytes.length }], myLimits(await readAll(), await getUploadPolicy(), me));
  if (limit) return `The logo was not saved. ${limit}`;

  const a = await saveAsset({
    brandId, name: `${brandName} logo`.slice(0, 200), type: "Logo", status: "Draft", channel: "Owned",
    short: "Taken from the website. Check it is the current version.", url: /^https?:/i.test(url) ? url.slice(0, 1000) : "",
  });
  if (!a.ok) return `The logo was not saved: ${a.error}`;
  const assetId = a.id!;
  const key = `assets/${assetId}/${crypto.randomUUID().slice(0, 8)}-${fileName}`;
  await saveFile(key, new File([file.bytes as Uint8Array<ArrayBuffer>], fileName, { type: checked.type }));
  const db = await getDb();
  await db.update(s.assets).set({
    files: [{ name: fileName, size: humanSize(file.bytes.length), bytes: file.bytes.length, uploadedBy: me.id, key, type: checked.type, url: `/api/files/${key}` }],
    updatedAt: new Date(),
  }).where(eq(s.assets.id, assetId));
  await db.insert(s.activity).values({ id: "ac" + crypto.randomUUID().replace(/-/g, "").slice(0, 10), userId: me.id, action: "uploaded to", type: "asset", itemId: assetId, label: `${brandName} logo`, field: fileName });
  return null;
}
