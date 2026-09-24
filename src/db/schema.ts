import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/*
 * BrandOS data model.
 *
 *   client (property) → brand (building) → sub-brand (wing)
 *   brand → service (floor) → offer (room) ←→ asset (furniture)
 *
 * Assets link to offers many-to-many through `links`; linking never copies.
 * Assets with no brand live in the Global Library.
 */

const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export type Access = "Admin" | "Manager" | "Editor" | "Contributor" | "Reviewer" | "Viewer" | "Client";
export type Review = "None" | "In review" | "Changes requested" | "Approved";
export type OfferStatus = "Ideation" | "Active" | "Paused" | "Archived";
export type AssetStatus = "Draft" | "Ready" | "Live" | "Archived";

export type Segment = { name: string; color: string };
export type Goal = { name: string; description: string };
export type BrandFont = {
  name: string; role: string; files: string;
  /** e.g. "400, 600, 700" */
  weights?: string;
  /** System font stack used when the brand font is missing. */
  fallback?: string;
  /** Where to get it: Google Fonts URL, foundry, licence note. */
  source?: string;
};
export type ColourRole = "Primary" | "Secondary" | "Accent" | "Neutral" | "Background" | "Text";
export type BrandColour = {
  name: string; hex: string; usage: string;
  role?: ColourRole;
  /** Print values. CMYK is worked out from the hex when left empty. */
  cmyk?: string;
  pantone?: string;
};
export type TypeStyle = { name: string; font: string; size: number; weight: number; lineHeight: number; tracking?: number; sample?: string };
/** The written half of a brand's guidelines. Everything is optional. */
export type BrandKit = {
  mission?: string;
  values?: string[];
  weAre?: string[];
  weAreNot?: string[];
  wordsUse?: string[];
  wordsAvoid?: string[];
  voiceExamples?: { context: string; say: string; dont: string }[];
  typeScale?: TypeStyle[];
  logo?: { clearSpace?: string; minDigital?: string; minPrint?: string; notes?: string; misuse?: string[] };
  imagery?: string;
  imageryDo?: string[];
  imageryDont?: string[];
  dos?: string[];
  donts?: string[];
  version?: string;
};
export type FileRef = { name: string; size: string; url?: string; key?: string; type?: string };
export type AssetCopy = { headline: string; body: string; cta: string };
export type CheckItem = { text: string; done: boolean };

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  email: text("email"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("Team member"),
  access: text("access").$type<Access>().notNull().default("Viewer"),
  allClients: boolean("all_clients").notNull().default(false),
  clientIds: text("client_ids").array().notNull().default([]),
  brandIds: text("brand_ids").array().notNull().default([]),
  groupIds: text("group_ids").array().notNull().default([]),
  ...stamps,
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  clientIds: text("client_ids").array().notNull().default([]),
  brandIds: text("brand_ids").array().notNull().default([]),
  ...stamps,
});

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default(""),
  contactId: text("contact_id"),
  since: text("since").notNull().default(""),
  note: text("note").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
});

export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  mark: text("mark").notNull(),
  tagline: text("tagline").notNull().default(""),
  primary: text("primary_color").notNull().default("#2D4A5C"),
  secondary: text("secondary_color").notNull().default("#7BA0A8"),
  ownerId: text("owner_id"),
  teamSize: integer("team_size").notNull().default(1),
  description: text("description").notNull().default(""),
  voice: text("voice").notNull().default(""),
  boilerplate: text("boilerplate").notNull().default(""),
  segments: jsonb("segments").$type<Segment[]>().notNull().default([]),
  goals: jsonb("goals").$type<Goal[]>().notNull().default([]),
  fonts: jsonb("fonts").$type<BrandFont[]>().notNull().default([]),
  colours: jsonb("colours").$type<BrandColour[]>().notNull().default([]),
  guidelines: jsonb("guidelines").$type<FileRef[]>().notNull().default([]),
  kit: jsonb("kit").$type<BrandKit>().notNull().default({}),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
}, (t) => [index("brands_client_idx").on(t.clientId)]);

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  name: text("name").notNull(),
  short: text("short").notNull().default(""),
  description: text("description").notNull().default(""),
  ownerId: text("owner_id"),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
}, (t) => [index("services_brand_idx").on(t.brandId)]);

export const offers = pgTable("offers", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  serviceId: text("service_id"),
  name: text("name").notNull(),
  short: text("short").notNull().default(""),
  segment: text("segment").notNull().default("All segments"),
  goals: text("goals").array().notNull().default([]),
  offerType: text("offer_type").notNull().default(""),
  status: text("status").$type<OfferStatus>().notNull().default("Ideation"),
  ownerId: text("owner_id"),
  positioning: text("positioning").notNull().default(""),
  promise: text("promise").notNull().default(""),
  proof: text("proof").notNull().default(""),
  primaryCtaId: text("primary_cta_id"),
  secondaryCtaId: text("secondary_cta_id"),
  tags: text("tags").array().notNull().default([]),
  review: text("review").$type<Review>().notNull().default("None"),
  reviewerId: text("reviewer_id"),
  changeNote: text("change_note").notNull().default(""),
  /** When this offer should launch. */
  dueAt: timestamp("due_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
}, (t) => [index("offers_brand_idx").on(t.brandId), index("offers_service_idx").on(t.serviceId)]);

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  brandId: text("brand_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  channel: text("channel").notNull().default("Owned"),
  status: text("status").$type<AssetStatus>().notNull().default("Draft"),
  review: text("review").$type<Review>().notNull().default("None"),
  reviewerId: text("reviewer_id"),
  changeNote: text("change_note").notNull().default(""),
  ownerId: text("owner_id"),
  version: integer("version").notNull().default(1),
  short: text("short").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  url: text("url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  copy: jsonb("copy").$type<AssetCopy | null>(),
  files: jsonb("files").$type<FileRef[]>().notNull().default([]),
  specs: text("specs").notNull().default(""),
  audienceNotes: text("audience_notes").notNull().default(""),
  aiPrompt: text("ai_prompt").notNull().default(""),
  ctaId: text("cta_id"),
  clientVisible: boolean("client_visible").notNull().default(false),
  isTemplate: boolean("is_template").notNull().default(false),
  clonedFromId: text("cloned_from_id"),
  gated: boolean("gated").notNull().default(false),
  delivery: text("delivery").notNull().default("None"),
  items: jsonb("items").$type<CheckItem[]>(),
  promptFor: text("prompt_for").notNull().default(""),
  prompt: text("prompt").notNull().default(""),
  /** When this asset has to be ready. */
  dueAt: timestamp("due_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
}, (t) => [index("assets_brand_idx").on(t.brandId)]);

/** Snapshot of an asset taken before each edit, so any version can be restored. */
export const assetVersions = pgTable("asset_versions", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  version: integer("version").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("asset_versions_asset_idx").on(t.assetId)]);

export const ctas = pgTable("ctas", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  text: text("text").notNull(),
  bg: text("bg").notNull().default("#2D4A5C"),
  fg: text("fg").notNull().default("#FFFFFF"),
  style: text("style").notNull().default("solid"),
  url: text("url").notNull().default(""),
  ...stamps,
});

export const links = pgTable("links", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  offerId: text("offer_id").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("links_pair_idx").on(t.assetId, t.offerId)]);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"asset" | "offer">().notNull(),
  itemId: text("item_id").notNull(),
  userId: text("user_id").notNull(),
  text: text("text").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  isChange: boolean("is_change").notNull().default(false),
  refs: text("refs").array().notNull().default([]),
  mentions: text("mentions").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
}, (t) => [index("comments_item_idx").on(t.kind, t.itemId)]);

export const activity = pgTable("activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  type: text("type").notNull(),
  itemId: text("item_id").notNull(),
  label: text("label").notNull().default(""),
  field: text("field").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("activity_created_idx").on(t.createdAt)]);

export const recents = pgTable("recents", {
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("recents_pk").on(t.userId, t.kind, t.itemId)]);

/** Per-person read receipts for mentions, so the inbox can show what is new. */
export const reads = pgTable("reads", {
  userId: text("user_id").notNull(),
  commentId: text("comment_id").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reads_pk").on(t.userId, t.commentId)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull(),
  /** "invite" sets a first password; "reset" replaces a forgotten one. */
  purpose: text("purpose").notNull().default("invite"),
  createdBy: text("created_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A secret, revocable link that shows a client the assets cleared to send for one brand. */
export const shareLinks = pgTable("share_links", {
  token: text("token").primaryKey(),
  brandId: text("brand_id").notNull(),
  label: text("label").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  views: integer("views").notNull().default(0),
}, (t) => [index("share_links_brand_idx").on(t.brandId)]);

export type ShareLink = typeof shareLinks.$inferSelect;

/**
 * The recycle bin. A delete copies every row it removes into one entry,
 * so restoring puts back exactly what was there. Entries expire after 30 days.
 */
export const trash = pgTable("trash", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  label: text("label").notNull(),
  /** Parent brand or client, so the bin can say where it came from. */
  context: text("context").notNull().default(""),
  rows: jsonb("rows").$type<Record<string, Record<string, unknown>[]>>().notNull(),
  deletedBy: text("deleted_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("trash_deleted_idx").on(t.deletedAt)]);

export type TrashEntry = typeof trash.$inferSelect;
export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type AssetVersion = typeof assetVersions.$inferSelect;
export type Cta = typeof ctas.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Activity = typeof activity.$inferSelect;
