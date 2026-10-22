import { ASSET_TYPES, type AssetRole } from "@/lib/constants";
import type { Funnel, FunnelArrow, FunnelBox, FunnelLink } from "@/db/schema";

/*
 * The funnel board's shared rules: grid, box sizes, limits, geometry and the
 * first draft laid out from what an offer already has. Pure, so the server,
 * the browser and a quick script all get the same answer.
 */

export type { Funnel, FunnelArrow, FunnelBox, FunnelLink };

export const GRID = 20;
export const MAX_BOXES = 200;
export const MAX_ARROWS = 400;
export const MAX_TEXT = 500;
export const MAX_LABEL = 80;
/** Boxes stay inside this square, so a stray drag can never make the board endless. */
export const MAX_COORD = 8000;

export const EMPTY_FUNNEL: Funnel = { boxes: [], arrows: [] };

export const snap = (v: number) => Math.round(v / GRID) * GRID;
export const clampCoord = (v: number) => Math.min(MAX_COORD, Math.max(0, v));

/** Width by shape when a box has not been given its own. */
export function boxWidth(b: Pick<FunnelBox, "kind" | "w" | "link">): number {
  if (b.w) return b.w;
  if (b.kind === "stage") return 180;
  if (b.kind === "note") return 180;
  return 210;
}

/** Height before the browser has measured the box. */
export function boxHeightGuess(b: Pick<FunnelBox, "kind" | "link">): number {
  if (b.kind === "stage") return 48;
  if (b.kind === "note") return 80;
  return b.link ? 68 : 56;
}

export const KIND_LABEL: Record<FunnelBox["kind"], string> = { step: "Step", stage: "Stage", note: "Note" };

/** Short random id for a box or arrow; unique enough within one board. */
export function fid(prefix: "b" | "a") {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/** Arrows whose ends are gone, loops and exact repeats are dropped. */
export function pruneArrows(f: Funnel): Funnel {
  const ids = new Set(f.boxes.map((b) => b.id));
  const seen = new Set<string>();
  const arrows = f.arrows.filter((a) => {
    const key = `${a.from}>${a.to}`;
    if (a.from === a.to || !ids.has(a.from) || !ids.has(a.to) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return arrows.length === f.arrows.length ? f : { ...f, arrows };
}

export const sameLink = (a?: FunnelLink, b?: FunnelLink) => (!a && !b) || (!!a && !!b && a.type === b.type && a.id === b.id);

/* ---------------------------------------------------------------- delete and undo */

/** What one delete took off the board, and where each piece sat in its list, so Undo can put it back as it was. */
export type Removed = { boxes: { at: number; box: FunnelBox }[]; arrows: { at: number; arrow: FunnelArrow }[] };

const without = (f: Funnel, boxIds: Set<string>, arrowIds: Set<string>): Funnel => ({
  boxes: f.boxes.filter((b) => !boxIds.has(b.id)),
  arrows: f.arrows.filter((a) => !arrowIds.has(a.id)),
});

/** Takes a box off the board with every arrow that starts or ends at it. Null when it is not there. */
export function removeBox(f: Funnel, id: string): { funnel: Funnel; removed: Removed } | null {
  const at = f.boxes.findIndex((b) => b.id === id);
  if (at < 0) return null;
  const arrows = f.arrows.flatMap((arrow, i) => (arrow.from === id || arrow.to === id ? [{ at: i, arrow }] : []));
  const removed: Removed = { boxes: [{ at, box: f.boxes[at] }], arrows };
  return { funnel: without(f, new Set([id]), new Set(arrows.map((x) => x.arrow.id))), removed };
}

/** Takes one arrow off the board. Null when it is not there. */
export function removeArrow(f: Funnel, id: string): { funnel: Funnel; removed: Removed } | null {
  const at = f.arrows.findIndex((a) => a.id === id);
  if (at < 0) return null;
  return { funnel: without(f, new Set(), new Set([id])), removed: { boxes: [], arrows: [{ at, arrow: f.arrows[at] }] } };
}

/**
 * Puts back what a delete took, each piece at its old place in its list, so
 * the board reads exactly as before. Anything already back is left alone, as
 * is an arrow whose two boxes another arrow now joins the same way. An arrow
 * whose box at either end has gone since cannot come back: `missed` counts
 * those. Null when the board has no room for it all any more.
 */
export function restore(f: Funnel, r: Removed): { funnel: Funnel; missed: number } | null {
  const have = new Set(f.boxes.map((b) => b.id));
  const back = r.boxes.filter((x) => !have.has(x.box.id)).sort((a, b) => a.at - b.at);
  for (const x of back) have.add(x.box.id);
  const ids = new Set(f.arrows.map((a) => a.id));
  const joins = new Set(f.arrows.map((a) => `${a.from}>${a.to}`));
  let missed = 0;
  const comeBack = [...r.arrows].sort((a, b) => a.at - b.at).filter(({ arrow: a }) => {
    const key = `${a.from}>${a.to}`;
    if (ids.has(a.id) || joins.has(key)) return false;
    if (!have.has(a.from) || !have.has(a.to)) { missed++; return false; }
    joins.add(key);
    return true;
  });
  if (f.boxes.length + back.length > MAX_BOXES || f.arrows.length + comeBack.length > MAX_ARROWS) return null;
  if (!back.length && !comeBack.length) return { funnel: f, missed };
  const boxes = [...f.boxes];
  for (const x of back) boxes.splice(Math.min(x.at, boxes.length), 0, x.box);
  const arrows = [...f.arrows];
  for (const x of comeBack) arrows.splice(Math.min(x.at, arrows.length), 0, x.arrow);
  return { funnel: { boxes, arrows }, missed };
}

/* ---------------------------------------------------------------- geometry */

export type Rect = { x: number; y: number; w: number; h: number };

/** Where the line from this rectangle's centre towards (tx, ty) leaves its edge, pushed out by `gap`. */
export function edgePoint(r: Rect, tx: number, ty: number, gap = 0): { x: number; y: number } {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  const len = Math.hypot(dx, dy);
  return { x: cx + dx * s + (dx / len) * gap, y: cy + dy * s + (dy / len) * gap };
}

/** The straight line between two boxes, clipped to their edges. Null when they overlap. */
export function arrowLine(from: Rect, to: Rect) {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const a = edgePoint(from, tc.x, tc.y, 3);
  const b = edgePoint(to, fc.x, fc.y, 4);
  // Overlapping boxes: the clipped ends cross over, so there is nothing sensible to draw.
  if ((b.x - a.x) * (tc.x - fc.x) + (b.y - a.y) * (tc.y - fc.y) <= 0) return null;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

/* ---------------------------------------------------------------- the first draft */

/* Which asset types go where comes from one place: ASSET_TYPES roles in lib/constants. */
const typesWith = (...roles: AssetRole[]) => new Set(Object.keys(ASSET_TYPES).filter((t) => roles.includes(ASSET_TYPES[t].role as AssetRole)));
/** Asset types that bring people in: ads, posts, emails, video and print. */
export const TRAFFIC_TYPES = typesWith("traffic");
/** Asset types that catch them: landing pages, lead magnets, and documents people download. */
export const CAPTURE_TYPES = new Set([...typesWith("entry"), "Document"]);
/** Asset types that make the ask believable. */
export const PROOF_TYPES = typesWith("proof");
/** Asset types people see once they have said yes: thank-you pages. */
export const AFTER_TYPES = typesWith("after");
/** Asset types that run after someone converts: automations and email sequences. */
export const AUTOMATION_TYPES = typesWith("automation");

export type DraftSource = {
  /** The offer's linked assets, in the order they should appear. */
  assets: { id: string; type: string }[];
  ctaId?: string | null;
  goal?: string | null;
  serviceId?: string | null;
};

/** What an offer already has, ready for `buildDraft`. Archived assets are left out. */
export function draftSource(
  offer: { primaryCtaId: string | null; goals: string[]; serviceId: string | null },
  assets: { id: string; type: string; archived: boolean }[],
): DraftSource {
  return {
    assets: assets.filter((a) => !a.archived).map((a) => ({ id: a.id, type: a.type })),
    ctaId: offer.primaryCtaId,
    goal: offer.goals[0] ?? null,
    serviceId: offer.serviceId,
  };
}

const X0 = 40, Y0 = 40, COL = 260, ROW = 100;

/**
 * Lays a first funnel out from what an offer already has, left to right:
 * ads and posts, then landing pages and lead magnets, then the primary CTA,
 * then the thank-you pages people land on once they say yes, then the goal
 * as a stage, then the automations that follow it. Case studies sit under
 * the CTA as proof; the service the offer feeds sits under the goal. Anything
 * else that is linked goes in a row underneath, so the board still indexes
 * it. Empty when the offer has nothing to draw.
 */
export function buildDraft(src: DraftSource): Funnel {
  const boxes: FunnelBox[] = [];
  const arrows: FunnelArrow[] = [];
  let nb = 0, na = 0;
  const box = (kind: FunnelBox["kind"], text: string, link?: FunnelLink): FunnelBox => ({ id: `b${++nb}`, kind, x: 0, y: 0, text, ...(link && { link }) });
  const arrow = (from: FunnelBox, to: FunnelBox, label?: string) => arrows.push({ id: `a${++na}`, from: from.id, to: to.id, ...(label && { label }) });

  const seen = new Set<string>();
  const assets = src.assets.filter((a) => !seen.has(a.id) && seen.add(a.id));
  const asAsset = (a: { id: string }) => box("step", "", { type: "asset", id: a.id });
  const traffic = assets.filter((a) => TRAFFIC_TYPES.has(a.type)).map(asAsset);
  const capture = assets.filter((a) => CAPTURE_TYPES.has(a.type)).map(asAsset);
  const proof = assets.filter((a) => PROOF_TYPES.has(a.type)).map(asAsset);
  const after = assets.filter((a) => AFTER_TYPES.has(a.type)).map(asAsset);
  const automation = assets.filter((a) => AUTOMATION_TYPES.has(a.type)).map(asAsset);
  const placedTypes = [TRAFFIC_TYPES, CAPTURE_TYPES, PROOF_TYPES, AFTER_TYPES, AUTOMATION_TYPES];
  const other = assets.filter((a) => !placedTypes.some((t) => t.has(a.type))).map(asAsset);
  const cta = src.ctaId ? box("step", "", { type: "cta", id: src.ctaId }) : null;
  const service = src.serviceId ? box("step", "", { type: "service", id: src.serviceId }) : null;

  if (!assets.length && !cta && !src.goal && !service) return { boxes: [], arrows: [] };
  const goal = box("stage", src.goal?.trim() || "Goal");

  // Main columns, skipping the empty ones; shorter columns are centred on the tallest.
  const columns = [traffic, capture, cta ? [cta] : [], after, [goal], automation].filter((c) => c.length);
  const tallest = Math.max(...columns.map((c) => c.length));
  // A stage pill is shorter than a linked card, so it drops half a grid step to line up with the cards' middles.
  const place = (b: FunnelBox, x: number, top: number) => { b.x = x; b.y = top + (b.kind === "stage" ? GRID / 2 : 0); };
  const rowTop = (b: FunnelBox) => b.y - (b.kind === "stage" ? GRID / 2 : 0);
  columns.forEach((col, i) => {
    const top = Y0 + snap(((tallest - col.length) * ROW) / 2);
    col.forEach((b, j) => place(b, X0 + i * COL, top + j * ROW));
  });
  const placed: FunnelBox[] = columns.flat();
  const below = (anchor: FunnelBox, list: FunnelBox[]) => {
    const colBottom = Math.max(...placed.filter((b) => b.x === anchor.x).map(rowTop));
    list.forEach((b, k) => place(b, anchor.x, colBottom + (k + 1) * ROW));
    placed.push(...list);
  };

  // Where each step leads: ads to every landing page (or straight to the ask), pages to the ask, the ask to
  // the thank-you pages (or the goal), and the goal on to what runs after it. Wide fans keep to one arrow each.
  const thanks = after.length ? after : [goal];
  const ask = cta ? [cta] : thanks;
  const first = capture.length ? capture : ask;
  const fan = (from: FunnelBox[], to: FunnelBox[]) => {
    for (const f of from) for (const t of from.length * to.length > 12 ? to.slice(0, 1) : to) arrow(f, t);
  };
  fan(traffic, first);
  fan(capture, ask);
  if (cta) fan([cta], thanks);
  fan(after, [goal]);
  fan([goal], automation);

  const proofAnchor = cta ?? capture[0] ?? goal;
  below(proofAnchor, proof);
  for (const p of proof) arrow(p, proofAnchor, "proof");
  if (service) {
    below(goal, [service]);
    arrow(goal, service, "feeds");
  }

  const bottom = Math.max(...placed.map(rowTop));
  other.forEach((b, k) => place(b, X0 + (k % 4) * COL, bottom + ROW + Math.floor(k / 4) * ROW));

  boxes.push(...placed, ...other);
  return { boxes, arrows };
}
