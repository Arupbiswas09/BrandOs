import type { Access, AssetStatus, OfferStatus, Review } from "@/db/schema";
import { ROLES, ROLE_INFO } from "@/lib/access";

export type AssetCategory = "campaign" | "master" | "global";

export const ASSET_TYPES: Record<string, { code: string; cat: AssetCategory }> = {
  "Landing page": { code: "LP", cat: "campaign" },
  Email: { code: "EM", cat: "campaign" },
  "Email sequence": { code: "SEQ", cat: "campaign" },
  "Social post": { code: "SOC", cat: "campaign" },
  "Meta ad": { code: "META", cat: "campaign" },
  "Google ad": { code: "ADS", cat: "campaign" },
  Newsletter: { code: "NL", cat: "campaign" },
  "Newsletter ad": { code: "NL", cat: "campaign" },
  Video: { code: "VID", cat: "campaign" },
  "Case study": { code: "CS", cat: "campaign" },
  Poster: { code: "PST", cat: "campaign" },
  Document: { code: "DOC", cat: "campaign" },
  "Lead magnet": { code: "MAG", cat: "campaign" },
  "LinkedIn post": { code: "LI", cat: "campaign" },
  Logo: { code: "LOGO", cat: "master" },
  Guidelines: { code: "GDL", cat: "master" },
  Font: { code: "FONT", cat: "master" },
  Checklist: { code: "CHK", cat: "global" },
  Prompt: { code: "PRM", cat: "global" },
  Template: { code: "TPL", cat: "global" },
  SOP: { code: "SOP", cat: "global" },
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
  Owned: "#475569",
  Google: "#2D6FA8",
  Meta: "#4B62C4",
  LinkedIn: "#1D6FA3",
  "Newsletter sponsorship": "#8156C7",
  "Onboarding flow": "#0E7490",
  Email: "#2F8F62",
  "Organic social": "#C2740C",
  Print: "#64748B",
};

export const ACCESS_LEVELS: Access[] = ROLES;

export const ACCESS_COLOR = Object.fromEntries(ROLES.map((r) => [r, ROLE_INFO[r].color])) as Record<Access, string>;

export const ACCESS_NOTE = Object.fromEntries(ROLES.map((r) => [r, ROLE_INFO[r].summary])) as Record<Access, string>;

export const DEFAULT_GOALS = [
  { name: "Awareness", description: "Be known by people who have never heard of us." },
  { name: "Audience growth", description: "Grow the audience we own — list, followers, members." },
  { name: "Revenue", description: "Turn interest into money, one-off or recurring." },
  { name: "Retention", description: "Keep and deepen the relationships we already have." },
  { name: "Recruitment", description: "Ask for time rather than money — volunteers, coaches, staff." },
];

export const GOAL_PALETTE = ["#8156C7", "#2D6FA8", "#2F8F62", "#C2740C", "#C2410C", "#0E7490", "#7C6AC4", "#B4553A"];

export const OFFER_TYPES = ["Audit", "Free consultation", "Lead magnet", "Content series", "Paid engagement", "Campaign"];

export const DELIVERY = ["Designed page", "Doc link", "File download", "Email sequence", "None"];

export const REVIEW_COLOR: Record<Review, string> = {
  None: "#94A3B8",
  "In review": "#C99A2E",
  "Changes requested": "#C2410C",
  Approved: "#2F8F62",
};

export const OFFER_STATUS: Record<OfferStatus, string> = {
  Ideation: "#7C6AC4",
  Active: "#2F8F62",
  Paused: "#C99A2E",
  Archived: "#94A3B8",
};

export const ASSET_STATUS: Record<AssetStatus, string> = {
  Draft: "#94A3B8",
  Ready: "#2D6FA8",
  Live: "#1F7A55",
  Archived: "#CBD5E1",
};

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

export const SEGMENT_PALETTE = ["#7C6AC4", "#2D6FA8", "#C2740C", "#2F8F62", "#C2410C", "#0E7490", "#B4553A", "#4B62C4"];

export const NEUTRAL = "#64748B";
export const GLOBAL_ACCENT = "#0F2A5F";
