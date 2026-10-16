import type { Asset } from "@/db/schema";

/**
 * How to get hold of an asset from a list: its one stored file, a zip of all
 * of them, or the link it points at. Drive links (and anything with a link but
 * no uploaded files) open the link instead of downloading. Null when there is
 * nothing to fetch yet. Same file rule as the Download button on asset cards.
 */
export type AssetGet = { kind: "file" | "zip" | "link"; href: string; title: string };

/** A link someone typed, made openable: https:// added when it is missing; script and data links never open. */
export function linkHref(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^(javascript|data|vbscript|file):/i.test(u)) return null;
  return `https://${u.replace(/^\/+/, "")}`;
}

export function assetGet(a: Pick<Asset, "id" | "type" | "url" | "files">): AssetGet | null {
  const link = linkHref(a.url);
  const stored = (a.files ?? []).filter((f) => f.key);
  if (link && (a.type === "Drive link" || !stored.length)) return { kind: "link", href: link, title: `Open ${link} in a new tab` };
  if (!stored.length) return null;
  if (stored.length === 1) return { kind: "file", href: stored[0].url ?? `/api/files/${stored[0].key}`, title: `Download ${stored[0].name}` };
  return { kind: "zip", href: `/api/assets/${a.id}/download`, title: `Download all ${stored.length} files as a zip` };
}
