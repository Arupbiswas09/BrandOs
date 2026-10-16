import type { Asset, Offer } from "@/db/schema";
import { NEUTRAL } from "./constants";
import { href } from "./routes";
import type { WS } from "./ws";

/*
 * Search over everything one person can see. The workspace is turned into a
 * flat index once per snapshot (cached against the snapshot itself), and each
 * keystroke only scans that index:
 *
 *   - case and accents never matter ("cafe" finds "Café"),
 *   - every word typed has to match, but each may match a different field,
 *   - the whole query as the title ranks first, then titles that start with
 *     it, then titles holding every word, then matches in other fields,
 *   - archived things always come last.
 *
 * The helpers at the top are pure; WS.search is the one entry point.
 */

/* ================================================================ text */

const FOLD: Record<string, string> = {
  "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i",
  "‘": "'", "’": "'", "‛": "'", "“": "\"", "”": "\"", "–": "-", "—": "-",
};
const FOLD_RE = /[ßæœøłđðþı‘’‛“”–—]/g;

/** Lower case, accents and curly quotes folded away: "Café Señor’s" → "cafe senor's". */
export function normalise(s: string): string {
  return s.normalize("NFKD").toLowerCase().replace(/\p{M}+/gu, "").replace(FOLD_RE, (c) => FOLD[c]);
}

/** The words someone typed, folded, without punctuation at either end. */
export function queryWords(q: string): string[] {
  const out = normalise(q).split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
  return [...new Set(out)];
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Whether `w` starts a word somewhere in `norm`. */
function startsWord(norm: string, w: string): boolean {
  for (let i = norm.indexOf(w); i >= 0; i = norm.indexOf(w, i + 1)) if (!isWordChar(norm[i - 1])) return true;
  return false;
}

/** One searchable piece of text, and what to call it in a snippet. */
export type Field = { label: string; text: string; norm: string; quiet?: boolean };

export function field(label: string, text: string | null | undefined, quiet = false): Field | null {
  const t = (text ?? "").trim();
  return t ? { label, text: t, norm: normalise(t), ...(quiet && { quiet }) } : null;
}

export type Match = { score: number; tier: number; field: Field | null };

/**
 * Does an item match every word, and how well. `title` is what the item is
 * called (null when it is not matched on, like a note); `fields` is the rest,
 * most telling first.
 */
export function match(title: Field | null, fields: Field[], words: string[]): Match | null {
  if (!words.length) return null;
  const phrase = words.join(" ");
  let score = 0, inTitle = 0, best: Field | null = null, bestAt = Infinity;
  for (const w of words) {
    if (title?.norm.includes(w)) {
      inTitle++;
      score += startsWord(title.norm, w) ? 12 : 8;
      continue;
    }
    const i = fields.findIndex((f) => f.norm.includes(w));
    if (i < 0) return null;
    const f = fields[i];
    score += (startsWord(f.norm, w) ? 4 : 2) - Math.min(i, 10) * 0.1;
    // The snippet shows the most telling field that matched.
    if (i < bestAt) { best = f; bestAt = i; }
  }
  const t = title?.norm ?? "";
  const tier = t && t === phrase ? 4 : t && t.startsWith(phrase) ? 3 : inTitle === words.length ? 2 : 1;
  // Shorter titles win a tie: "Audit" before "Audit follow-up email".
  return { score: tier * 100 + score - Math.min(t.length, 200) / 1000, tier, field: best };
}

/* ================================================================ highlighting */

export type Part = { text: string; hit: boolean };

/** The folded text with, for every folded character, where it came from in the original. */
function foldMap(text: string) {
  let norm = "";
  const from: number[] = [], to: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normalise(ch);
    for (let k = 0; k < n.length; k++) { from.push(i); to.push(i + ch.length); }
    norm += n;
    i += ch.length;
  }
  return { norm, from, to };
}

/** Where each typed word appears in `text`, merged and in order. */
function ranges(text: string, words: string[]): [number, number][] {
  const { norm, from, to } = foldMap(text);
  const out: [number, number][] = [];
  for (const w of words) {
    for (let i = norm.indexOf(w); i >= 0; i = norm.indexOf(w, i + w.length)) out.push([from[i], to[i + w.length - 1]]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

function split(text: string, rs: [number, number][], start = 0, end = text.length): Part[] {
  const parts: Part[] = [];
  let at = start;
  for (const [a, b] of rs) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, start), e = Math.min(b, end);
    if (s > at) parts.push({ text: text.slice(at, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    at = e;
  }
  if (at < end) parts.push({ text: text.slice(at, end), hit: false });
  return parts;
}

/** The whole of `text`, with every typed word marked. */
export function highlight(text: string, words: string[]): Part[] {
  return words.length ? split(text, ranges(text, words)) : [{ text, hit: false }];
}

/** About `max` characters of `text` from just before the first word found, every typed word marked, on one line. */
export function snippet(text: string, words: string[], max = 96): Part[] {
  const rs = ranges(text, words);
  const first = rs[0]?.[0] ?? 0;
  let start = 0, end = text.length;
  // A short lead-in, so the match still shows on a phone-width line. Start and stop on a space, so no word is cut in half.
  if (first > 28) {
    start = first - 18;
    const sp = text.indexOf(" ", start);
    if (sp >= 0 && sp < first) start = sp + 1;
  }
  if (end - start > max) {
    end = start + max;
    const sp = text.lastIndexOf(" ", end);
    if (sp > (rs[0]?.[1] ?? start)) end = sp;
  }
  const parts = split(text, rs, start, end).map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ") }));
  if (start > 0) parts.unshift({ text: "…", hit: false });
  if (end < text.length) parts.push({ text: "…", hit: false });
  return parts;
}

/* ================================================================ the workspace index */

export type SearchKind = "Page" | "Client" | "Brand" | "Service" | "Offer" | "Asset" | "Library" | "CTA" | "Folder" | "Person" | "Note";

/** Display order of result groups when scores tie, and of the filter chips. */
export const SEARCH_KINDS: SearchKind[] = ["Page", "Client", "Brand", "Service", "Offer", "Asset", "Library", "CTA", "Folder", "Person", "Note"];

/** Somewhere in the app the palette knows how to go to. */
export type SearchTarget =
  | { type: "href"; href: string }
  | { type: "asset"; id: string; tab?: string }
  | { type: "owner"; id: string }
  | { type: "action"; action: "new" | "new-offer" | "new-asset" | "new-service" | "new-cta" | "new-brand" | "new-client" | "new-library" | "inbox" | "shortcuts" };

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  /** Where it lives: "Quokka For Good · Church". */
  sub: string;
  code: string;
  color: string;
  archived: boolean;
  to: SearchTarget;
  score: number;
  /** The title with the typed words marked. */
  titleParts: Part[];
  /** Which other field matched, and a short marked piece of it. */
  field?: string;
  snippet?: Part[];
  ownerId?: string | null;
  /** The brand it belongs to, for narrowing results to one brand. */
  brandId?: string | null;
  /** Assets only: a picture for the row, and where the work is (Draft, Ready, Live). */
  thumb?: string | null;
  status?: string;
};

type Entry = {
  kind: SearchKind; id: string; name: string; title: Field | null; fields: Field[];
  /** Every field folded into one string, to rule an entry out with one check per word. */
  all: string;
  sub: string; code: string; color: string; archived: boolean; to: SearchTarget;
  ownerId?: string | null; updatedAt?: number; brandId?: string | null; thumb?: string | null; status?: string;
};

const cache = new WeakMap<object, Entry[]>();

const list = (label: string, items: (string | null | undefined)[]) => items.map((t) => field(label, t)).filter((f): f is Field => !!f);

function entry(e: Omit<Entry, "all" | "fields" | "title"> & { title?: Field | null; fields: (Field | null)[] }): Entry {
  const fields = e.fields.filter((f): f is Field => !!f);
  const title = e.title === undefined ? field("Name", e.name) : e.title;
  return { ...e, title, fields, all: [title?.norm ?? "", ...fields.map((f) => f.norm)].join("\u0001") };
}

/** Builds the flat index of one workspace snapshot. */
function build(ws: WS): Entry[] {
  const out: Entry[] = [];
  const d = ws.d;
  const brandName = (id: string | null | undefined) => ws.brand(id)?.name ?? "";
  const brandArchived = (id: string | null | undefined) => {
    const b = ws.brand(id);
    return !!b && (b.archived || !!ws.client(b.clientId)?.archived);
  };
  const owner = (id: string | null | undefined) => (id ? field("Owner", ws.user(id).name === "Unassigned" ? "" : ws.user(id).name) : null);
  const seeTeam = ws.can("access");

  /* ---------- pages and actions */
  const page = (id: string, name: string, sub: string, to: SearchTarget, keywords = "") =>
    out.push(entry({ kind: "Page", id, name, sub, code: "", color: NEUTRAL, archived: false, to, fields: [field("", keywords, true)] }));
  page("dashboard", "Dashboard", "Home", { type: "href", href: "/" }, "home start waiting on you continue where you left off");
  page("launches", "Launches", "Offer launch dates", { type: "href", href: "/calendar" }, "calendar dates launch schedule month");
  page("inbox", "Your queue", "What is waiting on you", { type: "action", action: "inbox" }, "inbox notifications mentions review waiting");
  if (!ws.isGuest) page("library", "Global Library", "Checklists, prompts, templates, SOPs", { type: "href", href: "/library" }, "checklists prompts templates sops shared");
  page("settings", "Settings", "Profile, display, notifications, security", { type: "href", href: "/settings" }, "profile password two-step verification notifications email display theme calendar feed sessions security");
  if (seeTeam) {
    page("team", "Team and access", `${d.users.length} people`, { type: "href", href: "/team" }, "people invite roles groups permissions upload limits access map");
    page("audit", "Audit log", "Sign-ins, access changes and deletions", { type: "href", href: "/audit" }, "security log history sign-ins");
  }
  if (ws.can("del")) page("trash", "Recycle bin", "Deleted assets and files", { type: "href", href: "/trash" }, "trash bin deleted restore");
  page("shortcuts", "Keyboard shortcuts", "Every key BrandOS listens for", { type: "action", action: "shortcuts" }, "keys help hotkeys");
  if (ws.can("edit")) {
    page("new", "Create something", "Offer, asset, service, CTA, brand or client", { type: "action", action: "new" }, "new add create");
    page("new-offer", "New offer", "Positioning, goals, promise and proof", { type: "action", action: "new-offer" }, "create add offer");
    page("new-asset", "New asset", "A landing page, email, ad or file", { type: "action", action: "new-asset" }, "create add asset upload landing page email ad");
    page("new-service", "New service", "A capability you sell", { type: "action", action: "new-service" }, "create add service");
    page("new-cta", "New CTA", "A reusable button", { type: "action", action: "new-cta" }, "create add cta button");
  }
  if (ws.can("library")) page("new-library", "New checklist or prompt", "Kept in the Global Library", { type: "action", action: "new-library" }, "create add checklist prompt template sop");
  if (ws.can("structure")) {
    page("new-brand", "New brand", "A new brand under a client", { type: "action", action: "new-brand" }, "create add brand sub-brand");
    page("new-client", "New client", "A new organisation you work for", { type: "action", action: "new-client" }, "create add client");
  }

  /* ---------- clients and brands */
  for (const c of d.clients) {
    const brands = d.brands.filter((b) => b.clientId === c.id);
    out.push(entry({
      kind: "Client", id: c.id, name: c.name, sub: [c.kind, `${brands.length} brand${brands.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
      code: "CL", color: NEUTRAL, archived: c.archived, to: { type: "href", href: href.client(c.id) },
      fields: [field("Sector", c.kind), field("What we do", c.note), field("Primary contact", c.contactId ? ws.user(c.contactId).name : "")],
    }));
  }
  for (const b of d.brands) {
    const parent = b.parentId ? ws.brand(b.parentId) : null;
    out.push(entry({
      kind: "Brand", id: b.id, name: b.name, sub: [ws.client(b.clientId)?.name, parent && `Sub-brand of ${parent.name}`].filter(Boolean).join(" · "),
      code: b.mark, color: b.primary, archived: brandArchived(b.id), to: { type: "href", href: href.brand(b.id) },
      ownerId: b.ownerId, brandId: b.id,
      fields: [
        field("Tagline", b.tagline), field("Description", b.description), field("Voice", b.voice), field("Boilerplate", b.boilerplate),
        ...list("Segment", b.segments.map((s) => s.name)),
        ...b.goals.flatMap((g) => [field("Goal", g.name), field("Goal", g.description)]),
        ...list("Offer type", b.offerTypes),
        ...list("Guidelines file", b.guidelines.map((g) => g.name)),
      ],
    }));
  }

  /* ---------- services, offers and their funnels */
  for (const v of d.services) {
    const n = ws.offersOfService(v.id).length;
    out.push(entry({
      kind: "Service", id: v.id, name: v.name, sub: `${brandName(v.brandId)} · ${n} offer${n === 1 ? "" : "s"}`,
      code: "SVC", color: ws.brand(v.brandId)?.primary ?? NEUTRAL, archived: v.archived || brandArchived(v.brandId),
      to: { type: "href", href: href.service(v.id) }, ownerId: v.ownerId, updatedAt: +new Date(v.updatedAt), brandId: v.brandId,
      fields: [field("One line", v.short), field("What it is", v.description), owner(v.ownerId)],
    }));
  }
  for (const o of d.offers) out.push(offerEntry(ws, o, brandArchived(o.brandId), owner(o.ownerId)));

  /* ---------- assets, Global Library items and CTAs */
  for (const a of d.assets) out.push(assetEntry(ws, a, brandArchived(a.brandId), owner(a.ownerId)));
  for (const c of d.ctas) {
    out.push(entry({
      kind: "CTA", id: c.id, name: c.text, sub: [brandName(c.brandId), c.url].filter(Boolean).join(" · "),
      code: "CTA", color: c.bg === "transparent" ? c.fg : c.bg, archived: brandArchived(c.brandId),
      to: { type: "href", href: `${href.brand(c.brandId, "kit")}#kit-ctas` }, brandId: c.brandId,
      fields: [field("Link", c.url)],
    }));
  }

  /* ---------- folders on offers */
  for (const f of d.folders) {
    const o = ws.offer(f.offerId);
    if (!o) continue;
    const n = d.links.filter((l) => l.folderId === f.id).length;
    out.push(entry({
      kind: "Folder", id: f.id, name: f.name, sub: `In ${o.name} · ${brandName(o.brandId)} · ${n} asset${n === 1 ? "" : "s"}`,
      code: "DIR", color: ws.brand(o.brandId)?.primary ?? NEUTRAL, archived: o.archived || brandArchived(o.brandId),
      to: { type: "href", href: href.offer(o.id) }, brandId: o.brandId, fields: [],
    }));
  }

  /* ---------- people: names for everyone, role and email for those who manage the team */
  for (const u of d.users) {
    out.push(entry({
      kind: "Person", id: u.id, name: u.name, sub: seeTeam ? [u.role, u.access, u.email].filter(Boolean).join(" · ") : "Their offers and assets",
      code: u.initials, color: NEUTRAL, archived: false, to: { type: "owner", id: u.id },
      fields: seeTeam ? [field("Role", u.role), field("Email", u.email), field("Access", u.access)] : [],
    }));
  }

  /* ---------- discussion notes: found by what they say, opened at the discussion */
  for (const c of d.comments) {
    const item = c.kind === "asset" ? ws.asset(c.itemId) : ws.offer(c.itemId);
    if (!item) continue;
    const who = ws.user(c.userId).name;
    out.push(entry({
      kind: "Note", id: c.id, name: item.name, title: null,
      sub: [who, brandName(item.brandId) || (c.kind === "asset" ? "Global Library" : ""), ws.ago(c.createdAt), c.resolved ? "resolved" : ""].filter(Boolean).join(" · "),
      code: "NOTE", color: ws.brand(item.brandId)?.primary ?? NEUTRAL, archived: item.archived || brandArchived(item.brandId),
      to: c.kind === "asset" ? { type: "asset", id: item.id, tab: "discussion" } : { type: "href", href: `${href.offer(item.id)}#discussion` },
      updatedAt: +new Date(c.createdAt), brandId: item.brandId,
      fields: [field(`Note by ${who.split(" ")[0]}`, c.text)],
    }));
  }
  return out;
}

function offerEntry(ws: WS, o: Offer, inArchivedBrand: boolean, owner: Field | null): Entry {
  const b = ws.brand(o.brandId);
  const svc = o.serviceId ? ws.service(o.serviceId) : null;
  const boxLabel = { step: "Funnel step", stage: "Funnel stage", note: "Funnel note" } as const;
  return entry({
    kind: "Offer", id: o.id, name: o.name, sub: [b?.name, o.segment, svc?.name].filter(Boolean).join(" · "),
    code: "OF", color: b?.primary ?? NEUTRAL, archived: o.archived || inArchivedBrand,
    to: { type: "href", href: href.offer(o.id) }, ownerId: o.ownerId, updatedAt: +new Date(o.updatedAt), brandId: o.brandId,
    fields: [
      field("Card label", o.short), field("Positioning", o.positioning), field("Promise", o.promise), field("Proof", o.proof),
      ...list("Tag", o.tags), field("Segment", o.segment), field("Offer type", o.offerType), ...list("Goal", o.goals),
      ...(o.funnel?.boxes ?? []).map((x) => field(boxLabel[x.kind] ?? "Funnel", x.text)),
      field("Status", o.status), owner,
    ],
  });
}

function assetEntry(ws: WS, a: Asset, inArchivedBrand: boolean, owner: Field | null): Entry {
  const b = ws.brand(a.brandId);
  const n = ws.linkedOfferIds(a.id).length;
  return entry({
    kind: a.brandId ? "Asset" : "Library", id: a.id, name: a.name,
    sub: [b ? b.name : "Global Library", a.type, n ? `${n} offer${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
    code: ws.codeOf(a), color: b?.primary ?? NEUTRAL, archived: a.archived || inArchivedBrand,
    to: { type: "asset", id: a.id }, ownerId: a.ownerId, updatedAt: +new Date(a.updatedAt), brandId: a.brandId,
    thumb: ws.previewOf(a), status: a.status,
    fields: [
      field("Description", a.short), ...list("File", a.files.map((f) => f.name)), ...list("Tag", a.tags),
      field("Headline", a.copy?.headline), field("Body copy", a.copy?.body), field("Button", a.copy?.cta),
      field("Notes", a.notes), field("Type", a.type), field("Channel", a.channel), field("Link", a.url),
      field("Creative specs", a.specs), field("Audience", a.audienceNotes), field("Prompt", a.prompt), ...list("Checklist", (a.items ?? []).map((i) => i.text)), owner,
    ],
  });
}

function indexOf(ws: WS): Entry[] {
  let idx = cache.get(ws.d);
  if (!idx) { idx = build(ws); cache.set(ws.d, idx); }
  return idx;
}

const KIND_ORDER = new Map(SEARCH_KINDS.map((k, i) => [k, i]));

/**
 * Everything matching `q`, best first. With `owner`, only that person's
 * offers, assets and services; an empty query then lists them newest first.
 */
export function searchWorkspace(ws: WS, q: string, opts: { owner?: string | null; limit?: number } = {}): SearchHit[] {
  const words = queryWords(q);
  const limit = opts.limit ?? 1000;
  let entries = indexOf(ws);
  if (opts.owner) entries = entries.filter((e) => e.ownerId === opts.owner && e.kind !== "Brand");
  if (!words.length) {
    if (!opts.owner) return [];
    return [...entries].sort((x, y) => Number(x.archived) - Number(y.archived) || (y.updatedAt ?? 0) - (x.updatedAt ?? 0)).slice(0, limit).map((e) => hit(e, null, []));
  }
  const found: { e: Entry; m: Match }[] = [];
  for (const e of entries) {
    if (!words.every((w) => e.all.includes(w))) continue;
    const m = match(e.title, e.fields, words);
    if (m) found.push({ e, m });
  }
  found.sort((x, y) =>
    Number(x.e.archived) - Number(y.e.archived) || y.m.score - x.m.score ||
    (KIND_ORDER.get(x.e.kind) ?? 99) - (KIND_ORDER.get(y.e.kind) ?? 99) || x.e.name.localeCompare(y.e.name));
  return found.slice(0, limit).map(({ e, m }) => hit(e, m, words));
}

/** Marking the matched words is the slow part, so it only happens for hits someone actually looks at. */
function hit(e: Entry, m: Match | null, words: string[]): SearchHit {
  const f = m?.field && !m.field.quiet ? m.field : null;
  let title: Part[] | undefined, snip: Part[] | undefined;
  return {
    kind: e.kind, id: e.id, title: e.name, sub: e.sub, code: e.code, color: e.color, archived: e.archived, to: e.to,
    score: m?.score ?? 0, ownerId: e.ownerId, brandId: e.brandId ?? null, thumb: e.thumb, status: e.status, field: f?.label,
    get titleParts() { return (title ??= e.title ? highlight(e.name, words) : [{ text: e.name, hit: false }]); },
    get snippet() { return f ? (snip ??= snippet(f.text, words)) : undefined; },
  };
}
