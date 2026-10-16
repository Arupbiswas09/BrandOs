import type { AssetStatus, OfferStatus } from "@/db/schema";
import { ASSET_TYPES, CHANNELS } from "@/lib/constants";
import { splitList } from "@/lib/csv";
import { cleanTag } from "@/lib/tags";

/*
 * What a spreadsheet import will do, row by row, before anything is saved.
 *
 * The browser runs this to show the preview; the server runs it again on the
 * same rows with its own copy of the brand (and the person's own
 * permissions) and imports only what it decides. Every limit here is the
 * limit of the matching form (saveOffer, saveAsset in src/app/actions.ts),
 * so an imported offer could have been typed in by hand.
 */

export type ImportKind = "offers" | "assets";
export type FieldKey =
  | "name" | "short" | "service" | "segment" | "positioning" | "promise" | "proof" | "goals" | "offerType" | "status" | "tags" | "launch"
  | "type" | "url" | "channel" | "offers" | "notes";

export type FieldDef = { key: FieldKey; label: string; required?: boolean; aliases: string[] };

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_COLUMNS = 60;
export const MAX_CELL = 10_000;
/** A brand holds up to this many segments, "All segments" included (saveBrand / saveKit). */
const MAX_SEGMENTS = 24;

export const OFFER_FIELDS: FieldDef[] = [
  { key: "name", label: "Offer name", required: true, aliases: ["offer name", "offer", "name", "title", "offer title"] },
  { key: "short", label: "Summary", aliases: ["summary", "short", "short description", "one line", "one liner", "subtitle", "strapline", "description"] },
  { key: "service", label: "Service", aliases: ["service", "service name", "services", "capability"] },
  { key: "segment", label: "Segment", aliases: ["segment", "audience", "market", "sector", "segment name"] },
  { key: "positioning", label: "Positioning", aliases: ["positioning", "position", "angle"] },
  { key: "promise", label: "Promise", aliases: ["promise", "value proposition", "value prop", "benefit", "outcome"] },
  { key: "proof", label: "Proof", aliases: ["proof", "proof points", "evidence", "credibility"] },
  { key: "goals", label: "Goals", aliases: ["goals", "goal", "objectives", "objective"] },
  { key: "offerType", label: "Offer type", aliases: ["offer type", "type", "kind", "format"] },
  { key: "status", label: "Status", aliases: ["status", "stage", "state"] },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels", "keywords"] },
  { key: "launch", label: "Launch date", aliases: ["launch date", "launch", "go live", "go live date", "launches", "due date", "due", "date", "start date"] },
];

export const ASSET_FIELDS: FieldDef[] = [
  { key: "name", label: "Asset name", required: true, aliases: ["asset name", "asset", "name", "title", "file name"] },
  { key: "type", label: "Type", aliases: ["type", "asset type", "kind", "format"] },
  { key: "url", label: "Link", aliases: ["url", "link", "links", "web address", "address", "href", "location"] },
  { key: "channel", label: "Channel", aliases: ["channel", "platform", "medium"] },
  { key: "status", label: "Status", aliases: ["status", "stage", "state"] },
  { key: "offers", label: "Offers", aliases: ["offers", "offer", "linked offers", "offer names", "offer name", "campaign", "campaigns"] },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels", "keywords"] },
  { key: "short", label: "Description", aliases: ["description", "summary", "short", "short description"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "comment"] },
];

export const fieldsOf = (kind: ImportKind) => (kind === "offers" ? OFFER_FIELDS : ASSET_FIELDS);

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Same value whatever the case and spacing. */
export const keyOf = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
/** Near enough to be the same thing: punctuation, spacing and a plural "s" do not count. */
const loose = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/s$/, "");

/** A first guess at what each column holds, from its heading. Each field is used once, by the first column that fits. */
export function guessColumns(kind: ImportKind, headers: string[]): (FieldKey | null)[] {
  const fields = fieldsOf(kind);
  const out: (FieldKey | null)[] = headers.map(() => null);
  const taken = new Set<FieldKey>();
  const hs = headers.map(norm);
  // Exact names first, so "Offer type" is the type and not the offer's name.
  hs.forEach((h, i) => {
    const f = fields.find((x) => !taken.has(x.key) && x.aliases.includes(h));
    if (f) { out[i] = f.key; taken.add(f.key); }
  });
  // Then headings that contain a name ("Offer name (internal)"), longest names first.
  const byLength = fields.flatMap((f) => f.aliases.map((a) => ({ f, a }))).sort((x, y) => y.a.length - x.a.length);
  hs.forEach((h, i) => {
    if (out[i] || !h) return;
    const hit = byLength.find(({ f, a }) => !taken.has(f.key) && (` ${h} `).includes(` ${a} `));
    if (hit) { out[i] = hit.f.key; taken.add(hit.f.key); }
  });
  return out;
}

/* ---------------------------------------------------------------- values */

/**
 * "16/10/2026", "16.10.2026", "16-10-26" (day first, as in Europe) or
 * "2026-10-16", as "2026-10-16". A month-first date is only read as one when
 * it cannot be anything else ("10/31/2026"), and says so.
 */
export function parseDate(raw: string): { iso: string; note?: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const valid = (y: number, m: number, d: number) => {
    const x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
  };
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return valid(y, mo, d) ? { iso: iso(y, mo, d) } : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const [a, b] = [+m[1], +m[2]];
    if (valid(y, b, a)) return { iso: iso(y, b, a) };
    if (a <= 12 && b > 12 && valid(y, a, b)) return { iso: iso(y, a, b), note: `read month first, as ${b}/${a}/${y}` };
  }
  return null;
}

const OFFER_STATUS: Record<string, OfferStatus> = {
  ideation: "Ideation", idea: "Ideation", draft: "Ideation", planned: "Ideation", planning: "Ideation", new: "Ideation",
  active: "Active", live: "Active", running: "Active", "on": "Active",
  paused: "Paused", "on hold": "Paused", hold: "Paused", stopped: "Paused",
  archived: "Archived", retired: "Archived", ended: "Archived",
};
const ASSET_STATUS: Record<string, AssetStatus> = {
  draft: "Draft", wip: "Draft", "in progress": "Draft", "to do": "Draft", todo: "Draft", idea: "Draft",
  ready: "Ready", done: "Ready", final: "Ready", approved: "Ready", complete: "Ready", completed: "Ready",
  live: "Live", published: "Live", running: "Live", active: "Live",
  archived: "Archived", retired: "Archived", old: "Archived",
};

const TYPE_ALIASES: Record<string, string> = {
  lp: "Landing page", landing: "Landing page", "landing page": "Landing page", page: "Landing page", "web page": "Landing page", webpage: "Landing page",
  magnet: "Lead magnet", "lead magnet": "Lead magnet", ebook: "Lead magnet", guide: "Lead magnet", download: "Lead magnet",
  "thank you": "Thank you page", "thank you page": "Thank you page", "thanks page": "Thank you page",
  flow: "Automation", workflow: "Automation", sequence: "Email sequence", "drip": "Email sequence", "nurture": "Email sequence",
  email: "Email", "e mail": "Email", newsletter: "Newsletter",
  social: "Social post", post: "Social post", instagram: "Social post", "instagram post": "Social post", "facebook post": "Social post", tweet: "Social post",
  "facebook ad": "Meta ad", "instagram ad": "Meta ad", "meta ad": "Meta ad", "google ad": "Google ad", "search ad": "Google ad", "ppc": "Google ad",
  linkedin: "LinkedIn post", "linkedin post": "LinkedIn post", video: "Video", reel: "Video", film: "Video", poster: "Poster", flyer: "Poster", print: "Poster",
  "case study": "Case study", testimonial: "Case study", doc: "Document", document: "Document", pdf: "Document", file: "Document", deck: "Document", "one pager": "Document",
  drive: "Drive link", "google drive": "Drive link", "google doc": "Drive link", "google docs": "Drive link", "google sheet": "Drive link", "google slides": "Drive link", "drive link": "Drive link",
  logo: "Logo", guidelines: "Guidelines", "brand guidelines": "Guidelines", font: "Font", checklist: "Checklist", prompt: "Prompt", template: "Template", sop: "SOP",
};

/** An asset type BrandOS knows, from its name, its short code ("LP") or a common word for it. */
export function matchAssetType(raw: string): string | null {
  const k = norm(raw);
  if (!k) return null;
  const byName = Object.keys(ASSET_TYPES).find((t) => norm(t) === k || loose(t) === loose(k));
  if (byName) return byName;
  const byCode = Object.entries(ASSET_TYPES).find(([, v]) => v.code.toLowerCase() === k);
  if (byCode) return byCode[0];
  return TYPE_ALIASES[k] ?? TYPE_ALIASES[k.replace(/s$/, "")] ?? null;
}

const CHANNEL_ALIASES: Record<string, string> = {
  owned: "Owned", web: "Owned", website: "Owned", site: "Owned", seo: "Owned",
  google: "Google", "google ads": "Google", adwords: "Google", search: "Google", ppc: "Google",
  meta: "Meta", facebook: "Meta", instagram: "Meta", fb: "Meta", ig: "Meta",
  linkedin: "LinkedIn", newsletter: "Newsletter sponsorship", "newsletter sponsorship": "Newsletter sponsorship", sponsorship: "Newsletter sponsorship",
  onboarding: "Onboarding flow", "onboarding flow": "Onboarding flow", email: "Email", "e mail": "Email", mailchimp: "Email",
  social: "Organic social", "organic social": "Organic social", organic: "Organic social", print: "Print", offline: "Print",
};

export function matchChannel(raw: string): string {
  const k = norm(raw);
  if (!k) return "Owned";
  return CHANNELS.find((c) => norm(c) === k) ?? CHANNEL_ALIASES[k] ?? raw.trim().slice(0, 80);
}

/** A web address as it is stored: http(s) only; a bare "www.example.org" gets https:// in front. */
export function cleanUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  const withScheme = /^https?:\/\//i.test(t) ? t : /^(www\.|[a-z0-9-]+(\.[a-z0-9-]+)+)(\/|$|\?)/i.test(t) && !/\s/.test(t) ? `https://${t}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return withScheme.length <= 1000 ? withScheme : null;
  } catch {
    return null;
  }
}

function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

/* ---------------------------------------------------------------- the plan */

export type BrandFacts = {
  services: { id: string; name: string; archived?: boolean }[];
  /** Segment names, "All segments" included. */
  segments: string[];
  offerTypes: string[];
  goals: string[];
  offers: { id: string; name: string }[];
  assets: { id: string; name: string; url: string }[];
};

export type Powers = {
  /** May add segments, goals and offer types to the brand (structure or kit). */
  shape: boolean;
  /** May mark work Live. */
  publish: boolean;
};

export type UnknownField = "service" | "segment" | "offerType" | "goal" | "type";

export type Choices = {
  /** Unknown values (by keyOf) to create; anything else unknown is left empty. */
  create: Partial<Record<Exclude<UnknownField, "type">, string[]>>;
  /** Unknown asset types (by keyOf) and the type each should become. Missing ones become Document. */
  types: Record<string, string>;
  /** Rows (by index) to import even though something with that name is already there. */
  duplicates: number[];
};

export const NO_CHOICES: Choices = { create: {}, types: {}, duplicates: [] };

export type Issue = { level: "error" | "warn"; text: string };

export type OfferValues = {
  name: string; short: string; positioning: string; promise: string; proof: string;
  serviceId: string | null;
  /** A service to create for this offer (shared by every row that names it). */
  newService: string | null;
  segment: string; goals: string[]; offerType: string; status: OfferStatus; tags: string[];
  /** "2026-10-16" or null. */
  dueAt: string | null;
};

export type AssetValues = {
  name: string; type: string; url: string; channel: string; status: AssetStatus; short: string; notes: string; tags: string[];
  offerIds: string[];
};

export type PlanRow = {
  /** Index in the data rows (the heading row not counted). */
  index: number;
  name: string;
  issues: Issue[];
  duplicate: null | "existing" | "earlier";
  /** Whether this row will be imported, after errors, duplicates and choices. */
  include: boolean;
  offer?: OfferValues;
  asset?: AssetValues;
};

export type Unknown = {
  field: UnknownField;
  /** As first written in the sheet. */
  value: string;
  key: string;
  rows: number;
  /** Whether this person may create it, and if not, why. */
  canCreate: boolean;
  why?: string;
  create: boolean;
  /** For unknown asset types: the type it becomes. */
  mappedTo?: string;
};

export type Plan = {
  kind: ImportKind;
  rows: PlanRow[];
  unknowns: Unknown[];
  /** Values the import adds to the brand, deduplicated, in first-seen order. */
  adds: { services: string[]; segments: string[]; offerTypes: string[]; goals: string[] };
  counts: { total: number; ready: number; errors: number; duplicates: number; skipped: number };
  /** Set when the import cannot run at all. */
  blocked: string | null;
};

const UNKNOWN_LABEL: Record<UnknownField, string> = { service: "service", segment: "segment", offerType: "offer type", goal: "goal", type: "asset type" };
export const unknownLabel = (f: UnknownField) => UNKNOWN_LABEL[f];

/** Works out what importing these rows would do. `columns[i]` says what column i holds (null: leave it out). */
export function planImport(kind: ImportKind, columns: (FieldKey | null)[], rows: string[][], brand: BrandFacts, can: Powers, choices: Choices = NO_CHOICES): Plan {
  const plan: Plan = { kind, rows: [], unknowns: [], adds: { services: [], segments: [], offerTypes: [], goals: [] }, counts: { total: rows.length, ready: 0, errors: 0, duplicates: 0, skipped: 0 }, blocked: null };
  if (rows.length > MAX_IMPORT_ROWS) plan.blocked = `That is ${rows.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`;
  if (!columns.includes("name")) plan.blocked ??= `Pick the column that holds each ${kind === "offers" ? "offer" : "asset"}'s name.`;

  const col = new Map<FieldKey, number>();
  columns.forEach((f, i) => { if (f && !col.has(f)) col.set(f, i); });
  const cell = (row: string[], f: FieldKey) => {
    const i = col.get(f);
    return i === undefined ? "" : (row[i] ?? "").slice(0, MAX_CELL).trim();
  };

  const unknowns = new Map<string, Unknown>();
  const createSet = (f: Exclude<UnknownField, "type">) => new Set((choices.create[f] ?? []).map(keyOf));
  const wantCreate = { service: createSet("service"), segment: createSet("segment"), offerType: createSet("offerType"), goal: createSet("goal") };
  let segmentRoom = MAX_SEGMENTS - new Set([...brand.segments.map(keyOf), "all segments"]).size;
  const note = (field: UnknownField, value: string): Unknown => {
    const key = keyOf(value);
    const id = `${field}:${key}`;
    let u = unknowns.get(id);
    if (!u) {
      let canCreate = true;
      let why: string | undefined;
      if (field === "type") canCreate = false;
      else if (field !== "service" && !can.shape) { canCreate = false; why = `Your role cannot add ${UNKNOWN_LABEL[field]}s to a brand. Ask a manager.`; }
      else if ((field === "segment" || field === "offerType" || field === "goal") && value.length > 80) { canCreate = false; why = "Names here can be up to 80 characters."; }
      else if (field === "service" && value.length > 200) { canCreate = false; why = "Service names can be up to 200 characters."; }
      else if (field === "segment" && segmentRoom <= 0) { canCreate = false; why = `A brand holds up to ${MAX_SEGMENTS} segments.`; }
      const create = field !== "type" && canCreate && wantCreate[field].has(key);
      if (field === "segment" && create) segmentRoom--;
      u = { field, value: value.trim(), key, rows: 0, canCreate, why, create, ...(field === "type" && { mappedTo: ASSET_TYPES[choices.types[key]] ? choices.types[key] : "Document" }) };
      unknowns.set(id, u);
    }
    u.rows++;
    return u;
  };
  const add = (list: string[], v: string) => { if (!list.some((x) => keyOf(x) === keyOf(v))) list.push(v.trim()); };

  const existing = new Set((kind === "offers" ? brand.offers : brand.assets).map((x) => keyOf(x.name)));
  const seen = new Set<string>();
  const duplicatesOk = new Set(choices.duplicates);
  const byLoose = <T extends { name: string }>(list: T[], v: string) => list.find((x) => keyOf(x.name) === keyOf(v)) ?? list.find((x) => loose(x.name) === loose(v));
  const nameLoose = (list: string[], v: string) => list.find((x) => keyOf(x) === keyOf(v)) ?? list.find((x) => loose(x) === loose(v));

  rows.forEach((row, index) => {
    const issues: Issue[] = [];
    const warn = (text: string) => issues.push({ level: "warn", text });
    const error = (text: string) => issues.push({ level: "error", text });
    const name = cell(row, "name").replace(/\s+/g, " ");
    const noun = kind === "offers" ? "offer" : "asset";
    if (!name) error(`No ${noun} name, so this row is skipped.`);
    else if (name.length > 200) error(`The name is ${name.length} characters; names can be up to 200.`);
    const k = keyOf(name);
    const duplicate: PlanRow["duplicate"] = !name ? null : existing.has(k) ? "existing" : seen.has(k) ? "earlier" : null;
    if (name) seen.add(k);

    const tags: string[] = [];
    for (const t of splitList(cell(row, "tags")).map(cleanTag)) if (t && !tags.includes(t)) tags.push(t);
    if (tags.length > 30) { warn(`Only the first 30 of ${tags.length} tags are kept.`); tags.length = 30; }

    const text = (f: FieldKey, label: string, max: number, cut: boolean) => {
      const v = cell(row, f);
      if (v.length <= max) return v;
      if (cut) { warn(`${label} was cut to ${max} characters.`); return cutAt(v, max); }
      error(`${label} is ${v.length} characters; it can be up to ${max}.`);
      return v;
    };

    const out: PlanRow = { index, name, issues, duplicate, include: false };
    if (kind === "offers") {
      const short = text("short", "The summary", 120, true);
      const positioning = text("positioning", "Positioning", 5000, false);
      const promise = text("promise", "The promise", 5000, false);
      const proof = text("proof", "Proof", 5000, false);

      let serviceId: string | null = null;
      let newService: string | null = null;
      const sv = cell(row, "service");
      if (sv) {
        const hit = byLoose(brand.services, sv);
        if (hit) { serviceId = hit.id; if (hit.archived) warn(`${hit.name} is archived; the offer goes under it anyway.`); }
        else {
          const u = note("service", sv);
          if (u.create) newService = u.value;
          else warn(`There is no service called ${sv}, so this offer has no service.`);
        }
      }

      let segment = "All segments";
      const sg = cell(row, "segment");
      if (sg && !["all", "all segments", "everyone", "any"].includes(keyOf(sg))) {
        const hit = nameLoose(brand.segments, sg);
        if (hit) segment = hit;
        else {
          const u = note("segment", sg);
          if (u.create) segment = u.value;
          else warn(`There is no segment called ${sg}, so this offer is for All segments.`);
        }
      }

      const goals: string[] = [];
      for (const g of splitList(cell(row, "goals"))) {
        const hit = nameLoose(brand.goals, g);
        let name: string | null = hit ?? null;
        if (!hit) {
          const u = note("goal", g);
          if (u.create) name = u.value;
          else warn(`There is no goal called ${g}, so it is left off.`);
        }
        if (name && !goals.some((x) => keyOf(x) === keyOf(name))) goals.push(name);
      }
      if (goals.length > 20) { warn("Only the first 20 goals are kept."); goals.length = 20; }

      let offerType = "";
      const ot = cell(row, "offerType");
      if (ot) {
        const hit = nameLoose(brand.offerTypes, ot);
        if (hit) offerType = hit;
        else {
          const u = note("offerType", ot);
          if (u.create) offerType = u.value;
          else warn(`There is no offer type called ${ot}, so it is left empty.`);
        }
      }

      let status: OfferStatus = "Ideation";
      const st = cell(row, "status");
      if (st) {
        const hit = OFFER_STATUS[keyOf(st)];
        if (hit) status = hit;
        else warn(`Status ${st} is not one BrandOS uses, so the offer starts in Ideation.`);
      }

      let dueAt: string | null = null;
      const ld = cell(row, "launch");
      if (ld) {
        const d = parseDate(ld);
        if (d) { dueAt = d.iso; if (d.note) warn(`The launch date was ${d.note}.`); }
        else warn(`The launch date ${ld} is not a date BrandOS can read (use 16/10/2026 or 2026-10-16), so it is left empty.`);
      }
      out.offer = { name, short, positioning, promise, proof, serviceId, newService, segment, goals, offerType, status, tags, dueAt };
    } else {
      const short = text("short", "The description", 300, true);
      const notes = text("notes", "Notes", 5000, false);
      const rawUrl = cell(row, "url");
      let url = cleanUrl(rawUrl);
      if (url === null) { warn(`${rawUrl.length > 60 ? rawUrl.slice(0, 57) + "…" : rawUrl} is not a web address BrandOS can open, so the link is left out.`); url = ""; }

      let type = "Document";
      const tp = cell(row, "type");
      if (tp) {
        const hit = matchAssetType(tp);
        if (hit) type = hit;
        else {
          const u = note("type", tp);
          type = u.mappedTo ?? "Document";
          warn(`BrandOS has no asset type called ${tp}; it comes in as ${type}.`);
        }
      } else if (url && /(^|\.)(drive|docs|sheets|slides)\.google\.com$/i.test(safeHost(url))) type = "Drive link";
      else warn("No type given, so it comes in as a Document.");

      let status: AssetStatus = "Draft";
      const st = cell(row, "status");
      if (st) {
        const hit = ASSET_STATUS[keyOf(st)];
        if (!hit) warn(`Status ${st} is not one BrandOS uses, so it starts as Draft.`);
        else if (hit === "Live" && !can.publish) { status = "Ready"; warn("Your role cannot mark work Live, so it comes in as Ready."); }
        else status = hit;
      }

      const offerIds: string[] = [];
      const cellOffers = cell(row, "offers");
      if (cellOffers) {
        // The whole cell first, in case an offer's name has a comma in it.
        const whole = byLoose(brand.offers, cellOffers);
        const names = whole ? [cellOffers] : splitList(cellOffers);
        for (const n of names) {
          const hit = whole ?? byLoose(brand.offers, n);
          if (!hit) { warn(`There is no offer called ${n} in this brand, so it is not linked.`); continue; }
          if (!offerIds.includes(hit.id)) offerIds.push(hit.id);
        }
      }
      out.asset = { name, type, url, channel: matchChannel(cell(row, "channel")), status, short, notes, tags, offerIds };
    }

    const hasError = issues.some((i) => i.level === "error");
    out.include = !plan.blocked && !hasError && (!duplicate || duplicatesOk.has(index));
    plan.rows.push(out);
  });

  plan.unknowns = [...unknowns.values()];
  for (const r of plan.rows) {
    if (r.issues.some((i) => i.level === "error")) plan.counts.errors++;
    else if (r.duplicate) plan.counts.duplicates++;
    if (r.include) plan.counts.ready++;
    else plan.counts.skipped++;
    if (!r.include || !r.offer) continue;
    // Only what an imported row actually uses is added to the brand.
    if (r.offer.newService) add(plan.adds.services, r.offer.newService);
    const u = (f: UnknownField, v: string) => unknowns.get(`${f}:${keyOf(v)}`)?.create;
    if (u("segment", r.offer.segment)) add(plan.adds.segments, r.offer.segment);
    if (r.offer.offerType && u("offerType", r.offer.offerType)) add(plan.adds.offerTypes, r.offer.offerType);
    for (const g of r.offer.goals) if (u("goal", g)) add(plan.adds.goals, g);
  }
  return plan;
}

function safeHost(url: string) {
  try { return new URL(url).hostname; } catch { return ""; }
}

/** Every unknown value that may be created, ticked; used as the starting choice. */
export function createAll(plan: Plan): Choices["create"] {
  const out: Choices["create"] = {};
  for (const u of plan.unknowns) {
    if (u.field === "type" || !u.canCreate) continue;
    (out[u.field] ??= []).push(u.key);
  }
  return out;
}

/* ---------------------------------------------------------------- Drive links */

const DRIVE_HOSTS = /^(drive|docs|sheets|slides|forms|jamboard|drive\.usercontent)\.google\.com$/i;

/** Whether a link points into Google Drive, Docs, Sheets, Slides or Forms. */
export function isDriveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && (DRIVE_HOSTS.test(u.hostname) || u.hostname.toLowerCase() === "forms.gle");
  } catch {
    return false;
  }
}

/** What kind of Drive item a link is, for a name when none is given. */
export function driveKind(url: string): string {
  const p = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
  if (/\/document\//.test(p)) return "Google Doc";
  if (/\/spreadsheets\//.test(p)) return "Google Sheet";
  if (/\/presentation\//.test(p)) return "Google Slides";
  if (/\/forms\//.test(p) || /forms\.gle/.test(url)) return "Google Form";
  if (/\/folders\//.test(p)) return "Drive folder";
  return "Drive file";
}

/** The same Drive item however the link was copied (sharing suffixes, /edit or /view). */
export function driveKey(url: string): string {
  const id = /\/(?:d|folders)\/([\w-]{10,})/.exec(url)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(url)?.[1];
  if (id) return `drive:${id}`;
  return url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

export type DriveLine = { index: number; name: string; url: string; issues: Issue[]; duplicate: null | "existing" | "earlier"; include: boolean };

/**
 * One link per line, optionally with a name: "Spring brief, https://docs…",
 * "https://docs… Spring brief" or a pasted two-column selection.
 */
export function parseDriveLines(text: string): { name: string; url: string }[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, MAX_IMPORT_ROWS + 1).map((line) => {
    const m = /(https?:\/\/[^\s"'<>]+|(?:drive|docs)\.google\.com\/[^\s"'<>]+|forms\.gle\/[^\s"'<>]+)/i.exec(line);
    if (!m) return { name: line.slice(0, 200), url: "" };
    const url = /^https?:/i.test(m[1]) ? m[1] : `https://${m[1]}`;
    const name = (line.slice(0, m.index) + " " + line.slice(m.index + m[1].length)).replace(/^[\s,;|:\t-]+|[\s,;|:\t-]+$/g, "").replace(/\s+/g, " ");
    return { name, url: url.replace(/[),.;]+$/, "") };
  });
}

export function planDriveLinks(lines: { name: string; url: string }[], brand: Pick<BrandFacts, "assets">, duplicates: number[] = []): { rows: DriveLine[]; blocked: string | null } {
  const blocked = lines.length > MAX_IMPORT_ROWS ? `That is ${lines.length} links. Import up to ${MAX_IMPORT_ROWS} at a time.` : null;
  const byUrl = new Set(brand.assets.filter((a) => a.url).map((a) => driveKey(a.url)));
  const byName = new Set(brand.assets.map((a) => keyOf(a.name)));
  const seen = new Set<string>();
  const ok = new Set(duplicates);
  const kinds = new Map<string, number>();
  const rows = lines.map((l, index): DriveLine => {
    const issues: Issue[] = [];
    const url = l.url.trim();
    let name = l.name.trim().replace(/\s+/g, " ");
    if (!url) issues.push({ level: "error", text: "There is no link on this line." });
    else if (url.length > 1000) issues.push({ level: "error", text: "That link is too long to keep." });
    else if (!isDriveUrl(url)) issues.push({ level: "error", text: "This is not a Google Drive, Docs, Sheets, Slides or Forms link." });
    if (!name && url) {
      // "Google Doc", then "Google Doc 2", so unnamed links can still be told apart.
      const kind = driveKind(url);
      const n = (kinds.get(kind) ?? 0) + 1;
      kinds.set(kind, n);
      name = n === 1 ? kind : `${kind} ${n}`;
    }
    if (name.length > 200) issues.push({ level: "error", text: "Names can be up to 200 characters." });
    const k = url ? driveKey(url) : "";
    const duplicate: DriveLine["duplicate"] = !k ? null : byUrl.has(k) || (!!l.name.trim() && byName.has(keyOf(name))) ? "existing" : seen.has(k) ? "earlier" : null;
    if (k) seen.add(k);
    const include = !blocked && !issues.some((i) => i.level === "error") && (!duplicate || ok.has(index));
    return { index, name, url, issues, duplicate, include };
  });
  return { rows, blocked };
}
