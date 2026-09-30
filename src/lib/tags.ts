/** A tag already in use, and on how many items. */
export type TagUse = { tag: string; n: number };

/** The tags on a set of items, most used first. */
export function tagPool(items: { tags: string[] }[]): TagUse[] {
  const counts = new Map<string, number>();
  for (const it of items) for (const t of new Set(it.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

/** A tag as it is stored: trimmed and lower case, as tags always have been. */
export const cleanTag = (t: string) => t.trim().toLowerCase().slice(0, 40);

/** What near-copies share: case, spaces against hyphens and a trailing "s" do not count, so "Grants" and "grant" are one tag. */
export const tagKey = (t: string) => cleanTag(t).replace(/[\s_-]+/g, "-").replace(/s$/, "");

/** The tag to keep for what someone typed: one already chosen or already in use wins over a new spelling of it. */
export function resolveTag(typed: string, pool: TagUse[], chosen: string[] = []): string {
  const t = cleanTag(typed);
  if (!t) return "";
  const k = tagKey(t);
  return chosen.find((c) => tagKey(c) === k) ?? pool.find((p) => tagKey(p.tag) === k)?.tag ?? t;
}

/** Adds typed text, one tag or several split on commas, to a list without adding a near-copy of anything on it. */
export function addTags(list: string[], typed: string, pool: TagUse[]): string[] {
  const out = [...list];
  for (const part of typed.split(",")) {
    const t = resolveTag(part, pool, out);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** "once", "twice" or "4 times". */
export const timesUsed = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
