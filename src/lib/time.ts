const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;

/** "3 days ago", measured against `now` so server and browser agree. */
export function timeAgo(when: Date | string | number, now: number): string {
  const t = new Date(when).getTime();
  const d = Math.max(0, now - t);
  if (d < 2 * MIN) return "just now";
  if (d < HOUR) return plural(Math.floor(d / MIN), "minute");
  if (d < DAY) return plural(Math.floor(d / HOUR), "hour");
  if (d < 2 * DAY) return "yesterday";
  if (d < WEEK) return plural(Math.floor(d / DAY), "day");
  if (d < 5 * WEEK) return plural(Math.floor(d / WEEK), "week");
  if (d < YEAR) return plural(Math.max(1, Math.floor(d / MONTH)), "month");
  return plural(Math.floor(d / YEAR), "year");
}
