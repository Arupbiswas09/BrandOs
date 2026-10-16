import type { Access, AssetStatus, OfferStatus, Review } from "@/db/schema";
import { ROLES, ROLE_INFO } from "@/lib/access";

export type AssetCategory = "campaign" | "master" | "global";
/**
 * What an asset does in a funnel — the one place this is decided. The service
 * page groups by it, the brand home counts by it and the funnel draft lays out
 * by it.
 *   entry      where people arrive and convert (landing pages, lead magnets)
 *   automation what runs after they convert (sequences, flows)
 *   after      what they see once they convert (thank-you pages)
 *   traffic    what brings people in (ads, posts, emails, print, video)
 *   proof      what makes the ask believable (case studies)
 *   resource   anything else that supports the offer (documents, Drive links)
 */
export type AssetRole = "entry" | "automation" | "after" | "traffic" | "proof" | "resource";

export const ASSET_TYPES: Record<string, { code: string; cat: AssetCategory; role?: AssetRole }> = {
  "Landing page": { code: "LP", cat: "campaign", role: "entry" },
  "Lead magnet": { code: "MAG", cat: "campaign", role: "entry" },
  "Thank you page": { code: "TY", cat: "campaign", role: "after" },
  Automation: { code: "AUTO", cat: "campaign", role: "automation" },
  "Email sequence": { code: "SEQ", cat: "campaign", role: "automation" },
  Email: { code: "EM", cat: "campaign", role: "traffic" },
  "Social post": { code: "SOC", cat: "campaign", role: "traffic" },
  "Meta ad": { code: "META", cat: "campaign", role: "traffic" },
  "Google ad": { code: "ADS", cat: "campaign", role: "traffic" },
  "LinkedIn post": { code: "LI", cat: "campaign", role: "traffic" },
  Newsletter: { code: "NL", cat: "campaign", role: "traffic" },
  "Newsletter ad": { code: "NL", cat: "campaign", role: "traffic" },
  Video: { code: "VID", cat: "campaign", role: "traffic" },
  Poster: { code: "PST", cat: "campaign", role: "traffic" },
  "Case study": { code: "CS", cat: "campaign", role: "proof" },
  Document: { code: "DOC", cat: "campaign", role: "resource" },
  "Drive link": { code: "DRV", cat: "campaign", role: "resource" },
  Logo: { code: "LOGO", cat: "master" },
  Guidelines: { code: "GDL", cat: "master" },
  Font: { code: "FONT", cat: "master" },
  Checklist: { code: "CHK", cat: "global" },
  Prompt: { code: "PRM", cat: "global" },
  Template: { code: "TPL", cat: "global" },
  SOP: { code: "SOP", cat: "global" },
  "Ad creative": { code: "AD", cat: "global" },
};

/** The funnel role of an asset type; unknown campaign types count as resources. */
export const roleOf = (type: string): AssetRole | null => {
  const t = ASSET_TYPES[type];
  if (!t) return "resource";
  return t.cat === "campaign" ? t.role ?? "resource" : null;
};

export const CHANNELS = [
  "Owned",
  "Google",
  "Meta",
  "LinkedIn",
  "Newsletter sponsorship",
  "Onboarding flow",
  "Email",
  "Organic social",
  "Print",
] as const;

export const CHANNEL_COLOR: Record<string, string> = {
  Owned: "#46534D",
  Google: "#2D6FA8",
  Meta: "#4B62C4",
  LinkedIn: "#1D6FA3",
  "Newsletter sponsorship": "#8156C7",
  "Onboarding flow": "#0E7490",
  Email: "#2F8F62",
  "Organic social": "#C2740C",
  Print: "#5E6C66",
};

export const ACCESS_LEVELS: Access[] = ROLES;

export const ACCESS_COLOR = Object.fromEntries(ROLES.map((r) => [r, ROLE_INFO[r].color])) as Record<Access, string>;

export const ACCESS_NOTE = Object.fromEntries(ROLES.map((r) => [r, ROLE_INFO[r].summary])) as Record<Access, string>;

export const DEFAULT_GOALS = [
  { name: "Awareness", description: "Be known by people who have never heard of us." },
  { name: "Audience growth", description: "Grow the audience we own: list, followers, members." },
  { name: "Revenue", description: "Turn interest into money, one-off or recurring." },
  { name: "Retention", description: "Keep and deepen the relationships we already have." },
  { name: "Recruitment", description: "Ask for time rather than money: volunteers, coaches, staff." },
];

export const GOAL_PALETTE = ["#8156C7", "#2D6FA8", "#2F8F62", "#C2740C", "#C2410C", "#0E7490", "#7C6AC4", "#B4553A"];

/** The starting list of offer types. Each brand keeps its own editable copy (brands.offerTypes). */
export const OFFER_TYPES = ["Audit", "Free consultation", "Lead magnet", "Content series", "Paid engagement", "Campaign"];

/** A brand's offer types, or the starting list when it has none. */
export function offerTypesOf(b: { offerTypes?: string[] | null } | null | undefined): string[] {
  return b?.offerTypes?.length ? b.offerTypes : OFFER_TYPES;
}

export const DELIVERY = ["Designed page", "Doc link", "File download", "Email sequence", "None"];

/*
 * The one state palette. Four tones and nothing else, so a colour means the
 * same thing on every screen:
 *   ok       approved, active, ready or live
 *   review   waiting on a reviewer
 *   change   sent back with changes requested
 *   neutral  not started, paused, draft or archived
 * A tone is always a small dot beside its word, never a filled chip, and
 * never red: red is kept for errors and destructive actions. Segments and
 * goals are not states, so they never borrow these colours as fills.
 */
export type Tone = "ok" | "review" | "change" | "neutral";

export const TONE: Record<Tone, string> = {
  ok: "#277A53",
  review: "#C99A2E",
  change: "#C2410C",
  neutral: "#93A09A",
};

export const REVIEW_COLOR: Record<Review, string> = {
  None: TONE.neutral,
  "In review": TONE.review,
  "Changes requested": TONE.change,
  Approved: TONE.ok,
};

export const OFFER_STATUS: Record<OfferStatus, string> = {
  Ideation: TONE.neutral,
  Active: TONE.ok,
  Paused: TONE.neutral,
  Archived: TONE.neutral,
};

export const ASSET_STATUS: Record<AssetStatus, string> = {
  Draft: TONE.neutral,
  Ready: TONE.ok,
  Live: TONE.ok,
  Archived: TONE.neutral,
};

/** Where something stands, as one dot and one word: a pending review first, then its stage. */
export type Stand = { word: string; tone: Tone; color: string; /** The stage and the review together, for a tooltip. */ full: string };

const pendingReview = (r: Review): r is "In review" | "Changes requested" => r === "In review" || r === "Changes requested";

export function offerStand(o: { status: OfferStatus; review: Review }): Stand {
  const full = o.review !== "None" ? `${o.status} · ${o.review}` : o.status;
  if (pendingReview(o.review)) return { word: o.review, tone: o.review === "In review" ? "review" : "change", color: REVIEW_COLOR[o.review], full };
  const tone: Tone = o.status === "Active" ? "ok" : "neutral";
  return { word: o.status, tone, color: TONE[tone], full };
}

export function assetStand(a: { status: AssetStatus; review: Review }): Stand {
  const full = a.review !== "None" ? `${a.status} · ${a.review}` : a.status;
  if (pendingReview(a.review)) return { word: a.review, tone: a.review === "In review" ? "review" : "change", color: REVIEW_COLOR[a.review], full };
  const tone: Tone = a.status === "Live" || a.status === "Ready" ? "ok" : "neutral";
  return { word: a.status, tone, color: TONE[tone], full };
}

export const ROLE_OPTIONS = [
  "Strategy lead",
  "Client lead",
  "Design",
  "Copy and content",
  "Paid media",
  "Account director",
  "Team member",
];

export const BRAND_PALETTES: [string, string][] = [
  ["#1F6F5C", "#E8B44A"],
  ["#4338CA", "#06B6D4"],
  ["#A3431F", "#4D7C0F"],
  ["#0E7490", "#F97316"],
  ["#0F2A5F", "#7DD3FC"],
  ["#1D4ED8", "#F59E0B"],
];

/**
 * The colour pair a new brand starts with, so no two brands look alike on day
 * one: the first pair whose primary no brand wears yet or, once every pair is
 * taken, the least worn. Archived brands are out of sight, so they do not count.
 */
export function freshBrandPair(brands: { primary: string; archived?: boolean }[]): [string, string] {
  const worn = (hex: string) => brands.filter((b) => !b.archived && b.primary.toUpperCase() === hex.toUpperCase()).length;
  let pick = BRAND_PALETTES[0];
  let least = Infinity;
  for (const pair of BRAND_PALETTES) {
    const n = worn(pair[0]);
    if (n < least) { pick = pair; least = n; }
  }
  return [pick[0], pick[1]];
}

/** Starting colours for new segments: none of them a state colour (green, amber or orange), so a segment dot never reads as a status. */
export const SEGMENT_PALETTE = ["#7C6AC4", "#2D6FA8", "#0E7490", "#A3456B", "#4B62C4", "#3F7F8C", "#8156C7", "#5E6C66"];

export const NEUTRAL = "#5E6C66";
export const GLOBAL_ACCENT = "#2D4A5C";
