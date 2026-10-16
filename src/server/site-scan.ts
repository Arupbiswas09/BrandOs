import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { normaliseUrl, safeFetch } from "@/server/safe-fetch";
import { IMAGE_EXT, ScanError, fromDataUrl, scanWith, sniffImage, type Fetcher, type SiteDraft } from "@/lib/site-draft";
import { refineDraft } from "@/server/site-ai";

/*
 * "Start a brand from its website", the server half: every request goes
 * through safeFetch (http and https only, no private or metadata addresses,
 * redirects re-checked, time and size capped). The reading itself is in
 * src/lib/site-draft.ts.
 */

/** The guarded fetcher. */
const guarded: Fetcher = async (url, o) => {
  const r = await safeFetch(url, { timeoutMs: o.timeoutMs, maxBytes: o.maxBytes, accept: o.accept, maxRedirects: 4 });
  return { status: r.status, url: r.url, contentType: r.contentType, body: r.body, truncated: r.truncated };
};

/**
 * Tests only, and never in production: with BRANDOS_SCAN_FIXTURES set to a
 * folder, addresses on fixture.brandos.test are read from that folder (the
 * e2e suite's fixture site), because safeFetch rightly refuses localhost.
 * Every other address still goes through safeFetch.
 */
export const FIXTURE_HOST = "fixture.brandos.test";
const FIXTURE_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain",
};

function fixtures(): Fetcher | null {
  if (process.env.NODE_ENV === "production") return null;
  const dir = process.env.BRANDOS_SCAN_FIXTURES;
  if (!dir) return null;
  const rootDir = path.resolve(dir);
  return async (url, o) => {
    const u = new URL(url);
    if (u.hostname !== FIXTURE_HOST) return guarded(url, o);
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(rootDir, "." + rel);
    const miss = { status: 404, url, contentType: "text/html", body: new TextEncoder().encode("Not found"), truncated: false };
    if (!file.startsWith(rootDir + path.sep)) return miss;
    try {
      const body = new Uint8Array(await readFile(file));
      return { status: 200, url, contentType: FIXTURE_TYPES[path.extname(file)] ?? "application/octet-stream", body: body.subarray(0, o.maxBytes), truncated: body.length > o.maxBytes };
    } catch {
      return miss;
    }
  };
}

/** The fetcher scans and logo downloads use. */
export const siteFetcher = (): Fetcher => fixtures() ?? guarded;

/**
 * Reads the site and returns a draft for a person to check. With
 * ANTHROPIC_API_KEY set, Claude then tidies the wording (tagline,
 * description, voice, services); without it, or if that fails or is slow,
 * the draft is the plain reading.
 */
export async function scanSite(raw: string): Promise<SiteDraft> {
  const start = normaliseUrl(raw);
  const { draft, digest } = await scanWith(start.toString(), siteFetcher(), { budgetMs: 15_000 });
  if (!process.env.ANTHROPIC_API_KEY) return draft;
  const ai = await refineDraft(digest, draft);
  if (!ai.ok) return { ...draft, notes: [...draft.notes, ai.why] };
  const r = ai.out;
  const services = r.services.filter((s) => s.name.trim()).slice(0, 8).map((s) => ({ name: s.name.trim().slice(0, 200), oneLine: s.oneLine.trim().slice(0, 200) }));
  return {
    ...draft,
    tagline: r.tagline.trim().slice(0, 200) || draft.tagline,
    description: r.description.trim().slice(0, 1000) || draft.description,
    voice: r.voice.trim().slice(0, 2000) || draft.voice,
    services: services.length ? services : draft.services,
    segments: r.segments.map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 4),
    notes: [...draft.notes.filter((n) => !n.startsWith("The voice is quoted")), "Claude tidied the tagline, description, voice and services from the site's own words. Check them."],
    refined: true,
  };
}

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * The chosen logo, downloaded again here (never trusted from the browser):
 * an image by its first bytes, not by what the server called it, and no
 * bigger than MAX_LOGO_BYTES. A drawing inlined in the page arrives as a
 * data: URL and is checked the same way.
 */
export async function fetchLogo(url: string): Promise<{ bytes: Uint8Array; type: string; ext: string }> {
  let bytes: Uint8Array | null;
  if (url.startsWith("data:")) {
    bytes = fromDataUrl(url);
    if (!bytes) throw new ScanError("That logo could not be read.");
  } else {
    const r = await siteFetcher()(url, { maxBytes: MAX_LOGO_BYTES, timeoutMs: 10_000, accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8" });
    if (r.status >= 300) throw new ScanError(`The site answered with an error (${r.status}) for the logo.`);
    if (r.truncated) throw new ScanError("The logo file is larger than 5 MB.");
    bytes = r.body;
  }
  if (bytes.length > MAX_LOGO_BYTES) throw new ScanError("The logo file is larger than 5 MB.");
  const type = sniffImage(bytes);
  if (!type) throw new ScanError("The logo is not an image BrandOS can keep.");
  return { bytes, type, ext: IMAGE_EXT[type] };
}
