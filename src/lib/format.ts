/*
 * Every date and time the interface shows goes through here, so they all
 * read the same way: European conventions, day before month ("16 Oct 2026"),
 * a 24-hour clock ("14:30") and weeks that start on Monday.
 */

const LOCALE = "en-GB";
type When = Date | string | number;
const d = (w: When) => (w instanceof Date ? w : new Date(w));

/** Weeks start on Monday (0 = Sunday … 6 = Saturday). */
export const WEEK_STARTS_ON = 1;

/** "16 Oct 2026"; with `short`, the year is dropped when it is this year ("16 Oct"). */
export function fmtDate(w: When, opts: { short?: boolean; now?: number } = {}): string {
  const x = d(w);
  const sameYear = x.getFullYear() === new Date(opts.now ?? Date.now()).getFullYear();
  return x.toLocaleDateString(LOCALE, { day: "numeric", month: "short", ...(!(opts.short && sameYear) && { year: "numeric" }) });
}

/** "Friday 16 October 2026", for headings and screen-reader labels. */
export function fmtLongDate(w: When): string {
  return d(w).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "October 2026". */
export function fmtMonth(w: When): string {
  return d(w).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** "Oct 2026", for compact "since" and "updated" labels. */
export function fmtMonthShort(w: When): string {
  return d(w).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });
}

/** "14:30". */
export function fmtTime(w: When): string {
  return d(w).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "16 Oct 2026, 14:30". */
export function fmtDateTime(w: When): string {
  return `${fmtDate(w)}, ${fmtTime(w)}`;
}

/** "1,234". */
export function fmtNumber(n: number): string {
  return n.toLocaleString(LOCALE);
}
