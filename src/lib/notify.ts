import type { NotifyEvent, NotifyMode, NotifyPrefs } from "@/db/schema";

/*
 * Email preferences. Pure, so Settings and the server agree on the defaults.
 */

export const NOTIFY_EVENTS: { event: NotifyEvent; label: string; note: string }[] = [
  { event: "review", label: "Review requested", note: "Someone asks you to approve their work." },
  { event: "changes", label: "Changes requested", note: "Your work is sent back with a note." },
  { event: "approved", label: "Approved", note: "Your work is approved." },
  { event: "mention", label: "Mentioned", note: "Someone @mentions you in a discussion." },
  { event: "due", label: "Due soon or overdue", note: "Your work is due in the next two days, or is late. Checked each morning." },
];

export const NOTIFY_MODES: { mode: NotifyMode; label: string }[] = [
  { mode: "instant", label: "Instant" },
  { mode: "digest", label: "Daily digest" },
  { mode: "off", label: "Off" },
];

const DEFAULTS: Record<NotifyEvent, NotifyMode> = {
  review: "instant",
  changes: "instant",
  approved: "instant",
  mention: "instant",
  due: "digest",
};

const MODES = new Set<string>(["instant", "digest", "off"]);

/** What someone chose for one kind of event, or the default. */
export function prefOf(prefs: NotifyPrefs | null | undefined, event: NotifyEvent): NotifyMode {
  const v = prefs?.[event];
  return v && MODES.has(v) ? v : DEFAULTS[event];
}

/** Every event with its effective choice filled in. */
export function fullPrefs(prefs: NotifyPrefs | null | undefined): Record<NotifyEvent, NotifyMode> {
  return Object.fromEntries(NOTIFY_EVENTS.map(({ event }) => [event, prefOf(prefs, event)])) as Record<NotifyEvent, NotifyMode>;
}
