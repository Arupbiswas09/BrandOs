import type { Asset, Brand, KitLegal, KitSocial, LegalSlot, LogoVariant, SocialNetwork, TypeStyle } from "@/db/schema";
import { linkEmbed, webUrl, type EmbedProvider } from "@/lib/embeds";
import { linkAddressIssue } from "@/lib/link-health";

/** What a complete, industry-standard Brand Kit contains, and whether this one has it. */
export function kitChecks(b: Brand, assets: Asset[]) {
  const k = b.kit ?? {};
  const logos = assets.filter((a) => a.brandId === b.id && a.type === "Logo" && !a.archived);
  return [
    { key: "logo", label: "Logo files", done: logos.length > 0, hint: "Upload the primary logo as a master file." },
    { key: "logoRules", label: "Logo rules", done: !!(k.logo?.clearSpace && (k.logo?.minDigital || k.logo?.minPrint)), hint: "Clear space and minimum size." },
    { key: "colours", label: "Colour palette", done: b.colours.length >= 2, hint: "At least a primary and one more." },
    { key: "print", label: "Print values", done: b.colours.some((c) => c.pantone || c.cmyk), hint: "Pantone or CMYK for print." },
    { key: "fonts", label: "Typefaces", done: b.fonts.length > 0, hint: "Heading and body fonts." },
    { key: "scale", label: "Type scale", done: (k.typeScale?.length ?? 0) >= 3, hint: "Sizes for headings and body." },
    { key: "voice", label: "Brand tone", done: !!b.voice && ((k.weAre?.length ?? 0) > 0 || (k.wordsAvoid?.length ?? 0) > 0), hint: "Tone words and words to avoid." },
    { key: "imagery", label: "Imagery style", done: !!k.imagery, hint: "What photography should look like." },
    { key: "rules", label: "Do's and don'ts", done: (k.dos?.length ?? 0) + (k.donts?.length ?? 0) > 0, hint: "The rules people break most." },
    { key: "boilerplate", label: "Boilerplate", done: !!b.boilerplate, hint: "The one paragraph about the brand." },
  ];
}

export function kitScore(b: Brand, assets: Asset[]) {
  const c = kitChecks(b, assets);
  return { checks: c, done: c.filter((x) => x.done).length, total: c.length, pct: Math.round((c.filter((x) => x.done).length / c.length) * 100) };
}

/** A sensible default type scale from the brand's fonts. */
export function defaultScale(b: Brand): TypeStyle[] {
  const head = b.fonts[0]?.name ?? "Inter";
  const body = b.fonts[1]?.name ?? head;
  return [
    { name: "Heading 1", font: head, size: 40, weight: 700, lineHeight: 1.1, tracking: -0.02 },
    { name: "Heading 2", font: head, size: 28, weight: 600, lineHeight: 1.2, tracking: -0.01 },
    { name: "Heading 3", font: head, size: 20, weight: 600, lineHeight: 1.3 },
    { name: "Body", font: body, size: 16, weight: 400, lineHeight: 1.55 },
    { name: "Small", font: body, size: 13, weight: 500, lineHeight: 1.4 },
  ];
}

/* ---------------------------------------------------------------- addresses */

/**
 * Why a pasted address cannot be kept, in one plain sentence, or null when it
 * is one web address. One link per field: two pasted together, or a stray
 * space, is refused here (the same check the asset form makes).
 */
export function addressProblem(raw: string, example = "yourbrand.org/page"): string | null {
  const t = raw.trim();
  if (!t) return "Paste the address.";
  const issue = linkAddressIssue(t);
  if (issue === "Two links in one address") return "Put one link here. This has two in it.";
  if (issue) return "Take the space out of the address, or paste the link again on its own.";
  if (!webUrl(t)) return `That is not a web address. Paste the full link, for example ${example}.`;
  return null;
}

/** The address as it is kept: always with its https:// (or http://). Call after addressProblem says it is fine. */
export const cleanAddress = (raw: string) => webUrl(raw)?.href ?? raw.trim();

/** A guidelines link: any web address. Google Docs, Slides and Drive (and Figma) preview in the kit; others open. */
export const guideLinkProblem = (raw: string) => addressProblem(raw, "docs.google.com/presentation/d/…");

/** A legal page kept as a link: any web address. */
export const legalLinkProblem = (raw: string) => addressProblem(raw, "yourbrand.org/privacy");

/** Where brand videos can come from: the players BrandOS may frame (src/lib/embeds.ts). */
export const VIDEO_PROVIDERS: EmbedProvider[] = ["YouTube", "Vimeo", "Loom", "Google Drive"];

/** A brand video has to be one that plays in the kit. */
export function videoProblem(raw: string): string | null {
  const p = addressProblem(raw, "youtube.com/watch?v=…");
  if (p) return p;
  const e = linkEmbed(raw);
  if (!e || !VIDEO_PROVIDERS.includes(e.provider)) return "Paste a YouTube, Vimeo, Loom or Google Drive video link. Those are the ones that play here.";
  if (e.src.includes("embeddedfolderview")) return "That is a Drive folder. Paste the link to the video itself.";
  return null;
}

/* ---------------------------------------------------------------- logo variations */

/** What a logo file can be, in the order the kit shows them. */
export const LOGO_VARIANTS: { v: LogoVariant; label: string }[] = [
  { v: "Primary", label: "Primary" },
  { v: "Secondary", label: "Secondary" },
  { v: "Icon", label: "Icon or mark" },
  { v: "Wordmark", label: "Wordmark" },
  { v: "Mono", label: "Mono" },
  { v: "On dark", label: "On dark" },
  { v: "On light", label: "On light" },
  { v: "Favicon", label: "Favicon" },
  { v: "Other", label: "Other" },
];

export const isLogoVariant = (v: unknown): v is LogoVariant => LOGO_VARIANTS.some((x) => x.v === v);
export const variantLabel = (v: LogoVariant) => LOGO_VARIANTS.find((x) => x.v === v)?.label ?? v;

/** The ground a logo is shown on: a reversed logo on dark, one for light backgrounds on white, the rest on the page tint. */
export function logoGround(v: LogoVariant | null | undefined): "dark" | "white" | "tint" {
  return v === "On dark" ? "dark" : v === "On light" ? "white" : "tint";
}
export const GROUND_HEX = { dark: "#101614", white: "#FFFFFF", tint: "#F4F7F5" } as const;

/**
 * The brand's live logo files, each with what it is, in the order of
 * LOGO_VARIANTS and unlabelled ones last. Labels are kept by asset id, so a
 * deleted logo's label waits for it to be restored.
 */
export function logoFiles(b: Brand, assets: Asset[]): { asset: Asset; variant: LogoVariant | null }[] {
  const labels = b.kit?.logoVariants ?? {};
  const rank = (v: LogoVariant | null) => (v ? LOGO_VARIANTS.findIndex((x) => x.v === v) : LOGO_VARIANTS.length);
  return assets
    .filter((a) => a.brandId === b.id && a.type === "Logo" && !a.archived)
    .map((asset) => ({ asset, variant: isLogoVariant(labels[asset.id]) ? labels[asset.id] : null }))
    .sort((x, y) => rank(x.variant) - rank(y.variant));
}

/* ---------------------------------------------------------------- legal */

/** The legal pages a kit keeps: two fixed, and room for one more (a cookie policy, unless it is renamed). */
export const LEGAL_SLOTS: { slot: LegalSlot; title: string }[] = [
  { slot: "privacy", title: "Privacy policy" },
  { slot: "terms", title: "Terms and conditions" },
  { slot: "extra", title: "Cookie policy" },
];

export function legalTitle(l: Pick<KitLegal, "slot" | "title">): string {
  const base = LEGAL_SLOTS.find((s) => s.slot === l.slot)?.title ?? "Legal page";
  return (l.slot === "extra" && l.title?.trim()) || base;
}

/** The kit's legal entry for a slot, if it holds anything. */
export function legalEntry(b: Brand, slot: LegalSlot): KitLegal | null {
  const l = (b.kit?.legal ?? []).find((x) => x.slot === slot);
  return l && (l.url || l.assetId) ? l : null;
}

/* ---------------------------------------------------------------- social links */

type Network = { network: SocialNetwork; label: string; hosts: string[]; profile?: (handle: string) => string; example: string };

/** The profiles a brand lists, in this order. A handle (@name) is turned into the address where the network has one form of it. */
export const SOCIAL_NETWORKS: Network[] = [
  { network: "website", label: "Website", hosts: [], example: "yourbrand.org" },
  { network: "instagram", label: "Instagram", hosts: ["instagram.com", "instagr.am"], profile: (h) => `https://www.instagram.com/${h}`, example: "instagram.com/yourbrand or @yourbrand" },
  { network: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], profile: (h) => `https://www.facebook.com/${h}`, example: "facebook.com/yourbrand" },
  { network: "linkedin", label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"], example: "linkedin.com/company/yourbrand" },
  { network: "x", label: "X", hosts: ["x.com", "twitter.com"], profile: (h) => `https://x.com/${h}`, example: "x.com/yourbrand or @yourbrand" },
  { network: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], profile: (h) => `https://www.youtube.com/@${h}`, example: "youtube.com/@yourbrand" },
  { network: "tiktok", label: "TikTok", hosts: ["tiktok.com"], profile: (h) => `https://www.tiktok.com/@${h}`, example: "tiktok.com/@yourbrand" },
  { network: "custom", label: "Other", hosts: [], example: "threads.net/@yourbrand" },
];

export const networkOf = (n: SocialNetwork) => SOCIAL_NETWORKS.find((x) => x.network === n) ?? SOCIAL_NETWORKS[SOCIAL_NETWORKS.length - 1];

/** What a social link is called: the network, or the name given to an "Other" one. */
export const socialName = (s: Pick<KitSocial, "network" | "label">) => (s.network === "custom" && s.label?.trim()) || networkOf(s.network).label;

const onHost = (host: string, hosts: string[]) => hosts.some((h) => host === h || host.endsWith(`.${h}`));

/** A pasted profile as the address to keep, or why it cannot be kept. */
export function socialAddress(network: SocialNetwork, raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const n = networkOf(network);
  const t = raw.trim();
  const handle = /^@([A-Za-z0-9._-]{1,60})$/.exec(t)?.[1];
  if (handle) {
    return n.profile ? { ok: true, url: n.profile(handle) } : { ok: false, error: `Paste the full ${n.label} address, for example ${n.example}.` };
  }
  const p = addressProblem(t, n.example);
  if (p) return { ok: false, error: p };
  const u = webUrl(t)!;
  if (n.hosts.length && !onHost(u.hostname.toLowerCase(), n.hosts)) return { ok: false, error: `That is not a ${n.label} address. It should look like ${n.example}.` };
  return { ok: true, url: u.href };
}

/** How a profile reads in a list: "@quokkaforgood" where the address holds a handle, else the address without https://. */
export function socialHandle(s: Pick<KitSocial, "network" | "url">): string {
  const u = webUrl(s.url);
  if (!u) return s.url;
  const parts = u.pathname.split("/").filter(Boolean);
  const plain = (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
  const at = (p?: string) => (p ? `@${p.replace(/^@/, "")}` : plain);
  switch (s.network) {
    case "instagram": case "x": case "tiktok": return at(parts[0]);
    case "youtube": return parts[0]?.startsWith("@") ? parts[0] : plain;
    case "facebook": return parts[0] && parts[0] !== "profile.php" ? at(parts[0]) : plain;
    case "linkedin": return parts[1] && ["company", "in", "school", "showcase"].includes(parts[0]) ? parts[1] : plain;
    default: return plain;
  }
}
