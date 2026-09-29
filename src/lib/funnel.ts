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

/** Asset types that bring people in: ads, posts, emails, video and print. */
export const TRAFFIC_TYPES = new Set(["Meta ad", "Google ad", "Social post", "LinkedIn post", "Newsletter ad", "Email", "Email sequence", "Newsletter", "Video", "Poster"]);
/** Asset types that catch them: landing pages, lead magnets and documents. */
export const CAPTURE_TYPES = new Set(["Landing page", "Lead magnet", "Document"]);
/** Asset types that make the ask believable. */
export const PROOF_TYPES = new Set(["Case study"]);

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
 * then the goal as a stage. Case studies sit under the CTA as proof; the
 * service the offer feeds sits under the goal. Anything else that is linked
 * goes in a row underneath, so the board still indexes it. Empty when the
 * offer has nothing to draw.
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
  const other = assets.filter((a) => !TRAFFIC_TYPES.has(a.type) && !CAPTURE_TYPES.has(a.type) && !PROOF_TYPES.has(a.type)).map(asAsset);
  const cta = src.ctaId ? box("step", "", { type: "cta", id: src.ctaId }) : null;
  const service = src.serviceId ? box("step", "", { type: "service", id: src.serviceId }) : null;

  if (!traffic.length && !capture.length && !proof.length && !other.length && !cta && !src.goal && !service) return { boxes: [], arrows: [] };
  const goal = box("stage", src.goal?.trim() || "Goal");

  // Main columns, skipping the empty ones; shorter columns are centred on the tallest.
  const columns = [traffic, capture, cta ? [cta] : [], [goal]].filter((c) => c.length);
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

  // Where each step leads: ads to every landing page (or straight to the ask), pages to the ask, the ask to the goal.
  const ask = cta ?? goal;
  const first = capture.length ? capture : [ask];
  for (const t of traffic) {
    const targets = first.length * traffic.length > 12 ? first.slice(0, 1) : first;
    for (const to of targets) arrow(t, to);
  }
  for (const c of capture) arrow(c, ask);
  if (cta) arrow(cta, goal);

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
