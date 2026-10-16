/*
 * Tracked links: the same page address with utm_* tags saying where a visit
 * came from, so analytics can tell the Meta ad from the newsletter. Pure, so
 * the builder works in the browser without a round trip.
 */

export type UtmParams = { source: string; medium: string; campaign: string; content?: string; term?: string };

/** A preset channel. `sources` lists the networks to choose from when the source depends on one (organic social). */
export type UtmChannel = { key: string; label: string; source: string; medium: string; sources?: string[] };

/**
 * The channels the team tags links for, with the source and medium each one
 * uses. Lower case with underscores, the way Google Analytics groups them.
 */
export const UTM_CHANNELS: UtmChannel[] = [
  { key: "meta", label: "Meta", source: "facebook", medium: "paid_social" },
  { key: "instagram", label: "Instagram", source: "instagram", medium: "paid_social" },
  { key: "google", label: "Google Ads", source: "google", medium: "cpc" },
  { key: "linkedin", label: "LinkedIn", source: "linkedin", medium: "paid_social" },
  { key: "email", label: "Email", source: "newsletter", medium: "email" },
  { key: "social", label: "Organic social", source: "linkedin", medium: "social", sources: ["linkedin", "facebook", "instagram", "x", "tiktok", "youtube", "threads"] },
  { key: "print", label: "QR / print", source: "print", medium: "qr" },
];

/** "Free Marketing Audit" → "free-marketing-audit": lower case, plain letters and digits, dashes between words. */
export function slug(text: string, max = 60): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * A tag value as typed, made consistent: analytics treats "Meta" and "meta"
 * as two sources, so lower case, spaces become dashes, and only letters,
 * digits and . _ ~ - stay. Underscores are kept ("paid_social").
 */
export function utmValue(text: string, max = 100): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._~-]+/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, max);
}

/**
 * The address as a browser would open it: https:// added to a bare domain,
 * anything that is not http(s) refused. The same rules as the server's
 * normaliseUrl, without importing server code.
 */
export function parseWebUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password || (!u.hostname.includes(".") && u.hostname !== "localhost")) return null;
    return u;
  } catch {
    return null;
  }
}

const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, "+");

/**
 * The tagged link, or null when `baseUrl` is not a web address. Existing
 * query parameters and the #fragment stay exactly as they were; any utm_*
 * already there is replaced. Empty values are left out.
 */
export function buildUtm(baseUrl: string, p: UtmParams): string | null {
  const u = parseWebUrl(baseUrl);
  if (!u) return null;
  const kept = u.search.replace(/^\?/, "").split("&").filter((pair) => pair && !/^utm_/i.test(decodeKey(pair)));
  const tags = (["source", "medium", "campaign", "content", "term"] as const)
    .map((k) => [k, (p[k] ?? "").trim()] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `utm_${k}=${enc(v)}`);
  const query = [...kept, ...tags].join("&");
  return `${u.origin}${u.pathname}${query ? `?${query}` : ""}${u.hash}`;
}

function decodeKey(pair: string) {
  const k = pair.split("=")[0];
  try { return decodeURIComponent(k.replace(/\+/g, " ")); } catch { return k; }
}

/** The tags on a link, for showing or testing. */
export function readUtm(link: string): Partial<UtmParams> {
  const u = parseWebUrl(link);
  if (!u) return {};
  const out: Partial<UtmParams> = {};
  for (const k of ["source", "medium", "campaign", "content", "term"] as const) {
    const v = u.searchParams.get(`utm_${k}`);
    if (v !== null) out[k] = v;
  }
  return out;
}
