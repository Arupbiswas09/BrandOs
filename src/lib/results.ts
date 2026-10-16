import type { Offer, OfferResult } from "@/db/schema";
import { fmtNumber } from "./format";

/*
 * Results per offer: what each period achieved, and what that adds up to
 * across many offers. Pure, so the offer page, the badges, the "what worked"
 * card and the server all count the same way.
 *
 * A rate only uses the periods where both of its numbers were recorded, so a
 * period with leads but no conversions written down yet does not pull the
 * conversion rate down.
 */

export type ResultRow = Pick<OfferResult, "id" | "offerId" | "period" | "endedOn" | "leads" | "calls" | "conversions" | "spend" | "lesson" | "createdAt">;

/** Fewer leads than this and a rate says more about luck than about the offer. */
export const MIN_LEADS = 20;
export const MAX_PERIOD = 60;
export const MAX_LESSON = 600;
/** The largest count or spend a period may hold. */
export const MAX_COUNT = 10_000_000;
export const MAX_RESULTS_PER_OFFER = 200;

const time = (w: Date | string | number | null | undefined) => (w ? new Date(w).getTime() : NaN);

/** Newest period first: by the day it ended, then by when it was recorded. */
export function newestFirst<T extends Pick<ResultRow, "endedOn" | "createdAt">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ea = time(a.endedOn), eb = time(b.endedOn);
    if (!Number.isNaN(ea) || !Number.isNaN(eb)) {
      if (Number.isNaN(ea)) return 1;
      if (Number.isNaN(eb)) return -1;
      if (eb !== ea) return eb - ea;
    }
    return time(b.createdAt) - time(a.createdAt);
  });
}

export type Rates = {
  /** conversions / leads, 0–1, or null when either was not recorded or there were no leads. */
  conversion: number | null;
  /** calls / leads. */
  callRate: number | null;
  /** spend / leads, only when something was spent. */
  costPerLead: number | null;
};

const ratio = (num: number | null | undefined, den: number | null | undefined) =>
  num == null || den == null || den <= 0 ? null : num / den;

/** The rates for one period. */
export function ratesOf(r: Pick<ResultRow, "leads" | "calls" | "conversions" | "spend">): Rates {
  return {
    conversion: ratio(r.conversions, r.leads),
    callRate: ratio(r.calls, r.leads),
    costPerLead: r.spend != null && r.spend > 0 ? ratio(r.spend, r.leads) : null,
  };
}

export type Totals = Rates & {
  periods: number;
  leads: number;
  calls: number;
  conversions: number;
  spend: number;
  /** Leads behind the conversion rate (periods with both numbers). */
  rateLeads: number;
  /** Whether any period recorded spend, so the cost per lead column is worth showing. */
  hasSpend: boolean;
};

/** Sums and rates over every period of one offer (or of many offers together). */
export function totalsOf(rows: Pick<ResultRow, "leads" | "calls" | "conversions" | "spend">[]): Totals {
  let leads = 0, calls = 0, conversions = 0, spend = 0;
  let convNum = 0, convDen = 0, callNum = 0, callDen = 0, spendNum = 0, spendDen = 0;
  for (const r of rows) {
    leads += r.leads ?? 0;
    calls += r.calls ?? 0;
    conversions += r.conversions ?? 0;
    spend += r.spend ?? 0;
    if (r.leads != null && r.conversions != null) { convNum += r.conversions; convDen += r.leads; }
    if (r.leads != null && r.calls != null) { callNum += r.calls; callDen += r.leads; }
    if (r.leads != null && r.spend != null && r.spend > 0) { spendNum += r.spend; spendDen += r.leads; }
  }
  return {
    periods: rows.length, leads, calls, conversions, spend,
    conversion: ratio(convNum, convDen),
    callRate: ratio(callNum, callDen),
    costPerLead: spendDen > 0 ? spendNum / spendDen : null,
    rateLeads: convDen,
    hasSpend: rows.some((r) => r.spend != null && r.spend > 0),
  };
}

export type Trend = {
  latest: ResultRow;
  previous: ResultRow;
  /** The change in conversion rate, in percentage points (latest minus previous). */
  points: number;
  direction: "up" | "down" | "flat";
};

/** How conversion moved between the last two periods that both have a rate. */
export function trendOf(rows: ResultRow[]): Trend | null {
  const rated = newestFirst(rows).filter((r) => ratesOf(r).conversion !== null);
  if (rated.length < 2) return null;
  const [latest, previous] = rated;
  const points = (ratesOf(latest).conversion! - ratesOf(previous).conversion!) * 100;
  const rounded = Math.round(points * 10) / 10;
  return { latest, previous, points: rounded, direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat" };
}

/** "Conversion rose to 11.9% in October, up 2.1 points on September." */
export function trendText(t: Trend): string {
  const now = pct(ratesOf(t.latest).conversion);
  if (t.direction === "flat") return `Conversion held at ${now} in ${t.latest.period}, the same as ${t.previous.period}.`;
  const pts = `${fmtOne(Math.abs(t.points))} ${Math.abs(t.points) === 1 ? "point" : "points"}`;
  return t.direction === "up"
    ? `Conversion rose to ${now} in ${t.latest.period}, up ${pts} on ${t.previous.period}.`
    : `Conversion fell to ${now} in ${t.latest.period}, down ${pts} on ${t.previous.period}.`;
}

/* ---------------------------------------------------------------- formatting */

const ONE = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONEY = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtOne = (n: number) => ONE.format(n);

/** "11.9%", or an en dash when there is no rate. */
export function pct(rate: number | null | undefined): string {
  return rate == null ? "–" : `${ONE.format(rate * 100)}%`;
}

/** "1,234", or an en dash when nothing was recorded. */
export function count(n: number | null | undefined): string {
  return n == null ? "–" : fmtNumber(n);
}

/** "4.20": spend is in the client's own currency, so no symbol is guessed. */
export function money(n: number | null | undefined): string {
  return n == null ? "–" : MONEY.format(n);
}

/* ---------------------------------------------------------------- what worked */

type InsightOffer = Pick<Offer, "id" | "name" | "offerType" | "segment" | "serviceId" | "archived">;

export type Insight = {
  key: string;
  text: string;
  /** Where the sentence leads: the offer (or service) that earned it. */
  link: { kind: "offer" | "service"; id: string; label: string };
};

type Group = { key: string; label: string; conv: number; leads: number; offers: { offer: InsightOffer; conv: number; leads: number }[] };

/** "Free consultation" → "Free consultations"; "Content series" stays as it is. */
export function pluralType(t: string): string {
  const s = t.trim();
  if (!s) return s;
  if (/(s|series|x|z|ch|sh)$/i.test(s)) return s;
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  return s + "s";
}

const ALL_SEGMENTS = "All segments";

/**
 * Up to `limit` short sentences about what converts best across these offers,
 * ranked by conversion rate. Only offers and groups with at least MIN_LEADS
 * leads count, and nothing is said unless two of them can be compared.
 */
export function whatWorked(
  offers: InsightOffer[],
  results: ResultRow[],
  opts: { serviceName?: (id: string) => string | undefined; limit?: number; minLeads?: number } = {},
): Insight[] {
  const min = opts.minLeads ?? MIN_LEADS;
  const limit = opts.limit ?? 3;
  const byOffer = new Map<string, ResultRow[]>();
  for (const r of results) (byOffer.get(r.offerId) ?? byOffer.set(r.offerId, []).get(r.offerId)!).push(r);

  // Each offer's own rate, from the periods that recorded both leads and conversions.
  const rated = offers.flatMap((offer) => {
    const t = totalsOf(byOffer.get(offer.id) ?? []);
    return t.conversion === null || t.rateLeads < min ? [] : [{ offer, conv: t.conversion, leads: t.rateLeads, convs: Math.round(t.conversion * t.rateLeads) }];
  });
  if (rated.length < 2) return [];

  const group = (keyOf: (o: InsightOffer) => string | null, labelOf: (k: string) => string, list = rated): Group[] => {
    const m = new Map<string, typeof rated>();
    for (const x of list) {
      const k = keyOf(x.offer);
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(x);
    }
    return [...m].map(([key, xs]) => {
      const leads = xs.reduce((n, x) => n + x.leads, 0);
      const convs = xs.reduce((n, x) => n + x.convs, 0);
      return { key, label: labelOf(key), leads, conv: convs / leads, offers: xs.sort((a, b) => b.conv - a.conv) };
    }).filter((g) => g.leads >= min).sort((a, b) => b.conv - a.conv || b.leads - a.leads);
  };
  const facts = (g: { conv: number; leads: number }) => `(${pct(g.conv)} from ${fmtNumber(g.leads)} leads)`;
  const top = (g: Group) => g.offers[0].offer;
  const offerLink = (o: InsightOffer) => ({ kind: "offer" as const, id: o.id, label: o.name });

  const out: Insight[] = [];
  const said = new Set<string>();
  const add = (i: Insight, offerIds: string[]) => {
    // Two sentences that rest on exactly the same offers say the same thing twice.
    const sig = [...offerIds].sort().join(",");
    if (said.has(sig)) return;
    said.add(sig);
    out.push(i);
  };

  // 1. Within one segment, which kind of offer converts best. The strongest
  // segment goes first; the others wait until every other kind of sentence had its turn.
  const segments = group((o) => (o.segment && o.segment !== ALL_SEGMENTS ? o.segment : null), (k) => k);
  const perSegment: [Insight, string[]][] = [];
  for (const seg of segments) {
    const types = group((o) => o.offerType || null, (k) => k, seg.offers.map((x) => ({ ...x, convs: Math.round(x.conv * x.leads) })));
    if (types.length < 2) continue;
    const best = types[0];
    perSegment.push([{ key: `seg:${seg.key}:${best.key}`, text: `${pluralType(best.label)} convert best for ${seg.label} ${facts(best)}.`, link: offerLink(top(best)) }, best.offers.map((x) => x.offer.id)]);
  }
  if (perSegment[0]) add(...perSegment[0]);

  // 2. Which kind of offer converts best overall.
  const types = group((o) => o.offerType || null, (k) => k);
  if (types.length >= 2) {
    const best = types[0];
    add({ key: `type:${best.key}`, text: `${pluralType(best.label)} convert best overall ${facts(best)}.`, link: offerLink(top(best)) }, best.offers.map((x) => x.offer.id));
  }

  // 3. Which service's offers convert best.
  const services = group((o) => o.serviceId, (k) => opts.serviceName?.(k) ?? "One service");
  if (services.length >= 2) {
    const best = services[0];
    add({ key: `svc:${best.key}`, text: `${best.label} converts best of the services ${facts(best)}.`, link: { kind: "service", id: best.key, label: best.label } }, best.offers.map((x) => x.offer.id));
  }

  // 4. Which audience converts best.
  if (segments.length >= 2) {
    const best = segments[0];
    add({ key: `segbest:${best.key}`, text: `Offers for ${best.label} convert best ${facts(best)}.`, link: offerLink(top(best)) }, best.offers.map((x) => x.offer.id));
  }

  // 5. The single best offer.
  const bestOffer = [...rated].sort((a, b) => b.conv - a.conv || b.leads - a.leads)[0];
  add({ key: `offer:${bestOffer.offer.id}`, text: `${bestOffer.offer.name} converts best of these offers ${facts(bestOffer)}.`, link: offerLink(bestOffer.offer) }, [bestOffer.offer.id]);

  // 6. The other segments.
  for (const x of perSegment.slice(1)) add(...x);

  return out.slice(0, limit);
}
