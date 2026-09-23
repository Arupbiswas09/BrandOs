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

export type DueTone = "overdue" | "today" | "soon" | "later";

/** "Overdue 2 days", "Due today", "Due in 3 days", "Due 14 Oct". */
export function dueLabel(when: Date | string | number, now: number): { label: string; tone: DueTone } {
  const d = new Date(when);
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(d) - day(new Date(now))) / DAY);
  if (diff < 0) return { label: `Overdue ${-diff} day${diff === -1 ? "" : "s"}`, tone: "overdue" };
  if (diff === 0) return { label: "Due today", tone: "today" };
  if (diff === 1) return { label: "Due tomorrow", tone: "soon" };
  if (diff <= 7) return { label: `Due in ${diff} days`, tone: "soon" };
  return { label: `Due ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, tone: "later" };
}

export const DUE_COLOR: Record<DueTone, string> = { overdue: "#B42318", today: "#C2410C", soon: "#8A6A12", later: "#566560" };

/** yyyy-mm-dd for <input type="date">. */
export function toDateInput(when: Date | string | number | null | undefined): string {
  if (!when) return "";
  const d = new Date(when);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
