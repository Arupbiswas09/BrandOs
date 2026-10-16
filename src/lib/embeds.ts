/*
 * Which pasted links BrandOS can preview inside the page, and the exact
 * address each one is framed from. Only these six origins are allowed as
 * frame sources in the Content-Security-Policy (src/proxy.ts), so this list
 * and that one have to change together.
 *
 *   Figma                  https://www.figma.com/embed
 *   Google Docs/Sheets/…   https://docs.google.com/…/preview
 *   Google Drive files     https://drive.google.com/file/d/…/preview
 *   YouTube                https://www.youtube-nocookie.com/embed/…   (no tracking cookies until play)
 *   Vimeo                  https://player.vimeo.com/video/…?dnt=1     (do not track)
 *   Loom                   https://www.loom.com/embed/…
 */

export type EmbedProvider = "Figma" | "Google Docs" | "Google Sheets" | "Google Slides" | "Google Drive" | "YouTube" | "Vimeo" | "Loom";

export type Embed = {
  provider: EmbedProvider;
  /** The address to frame. Always https, always one of the allowed origins. */
  src: string;
  /** Video plays at 16:9; documents and designs get a taller 16:10 frame. */
  shape: "video" | "page";
};

/** The frame sources the CSP allows, for the check in tests. */
export const EMBED_ORIGINS = [
  "https://www.figma.com", "https://docs.google.com", "https://drive.google.com",
  "https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.loom.com",
] as const;

/**
 * A pasted link as a URL, or null when it is not a web address. Links saved
 * without a scheme ("docs.google.com/…") are read as https. Any other scheme
 * (javascript:, data:, mailto:) is refused, so it never reaches an href.
 */
export function webUrl(raw: string | null | undefined): URL | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 2000) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s);
  if (hasScheme && !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(hasScheme ? s : `https://${s.replace(/^\/+/, "")}`);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Where a link goes, for a calm link card: "figma.com" and "/design/abc/Homepage". */
export function linkParts(u: URL): { host: string; path: string } {
  let path = u.pathname + u.search;
  try { path = decodeURI(path); } catch { /* keep it encoded */ }
  return { host: u.hostname.replace(/^www\./, ""), path: path === "/" ? "" : path };
}

const ID = /^[A-Za-z0-9_-]{6,120}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/** The in-page preview for a link, or null when it is not one we frame. */
export function linkEmbed(raw: string | null | undefined): Embed | null {
  const u = webUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "figma.com") {
    if (!["file", "design", "proto", "board", "slides", "deck"].includes(parts[0] ?? "") || !ID.test(parts[1] ?? "")) return null;
    const clean = new URL(u.href);
    clean.protocol = "https:";
    clean.hostname = "www.figma.com";
    return { provider: "Figma", src: `https://www.figma.com/embed?embed_host=brandos&url=${encodeURIComponent(clean.href)}`, shape: "page" };
  }

  if (host === "docs.google.com") {
    // /document/d/<id>/edit, also /document/u/1/d/<id>/edit when signed in to several accounts.
    const kind = parts[0];
    const rest = parts[1] === "u" ? parts.slice(3) : parts.slice(1);
    const provider = ({ document: "Google Docs", spreadsheets: "Google Sheets", presentation: "Google Slides" } as const)[kind as "document"];
    if (!provider || rest[0] !== "d" || !ID.test(rest[1] ?? "")) return null;
    return { provider, src: `https://docs.google.com/${kind}/d/${rest[1]}/preview`, shape: "page" };
  }

  if (host === "drive.google.com") {
    const rest = parts[0] === "u" ? parts.slice(2) : parts;
    if (rest[0] === "file" && rest[1] === "d" && ID.test(rest[2] ?? "")) {
      return { provider: "Google Drive", src: `https://drive.google.com/file/d/${rest[2]}/preview`, shape: "page" };
    }
    const folder = rest[0] === "drive" ? (rest[1] === "u" ? rest.slice(3) : rest.slice(1)) : null;
    if (folder?.[0] === "folders" && ID.test(folder[1] ?? "")) {
      return { provider: "Google Drive", src: `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`, shape: "page" };
    }
    const open = u.searchParams.get("id");
    if (rest[0] === "open" && open && ID.test(open)) return { provider: "Google Drive", src: `https://drive.google.com/file/d/${open}/preview`, shape: "page" };
    return null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    if (!id || !YT_ID.test(id)) return null;
    const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
    return { provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`, shape: "video" };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted), vimeo.com/channels/x/123, player.vimeo.com/video/123?h=abcdef
    const at = parts.findIndex((p) => /^\d{5,12}$/.test(p));
    if (at < 0) return null;
    const hash = u.searchParams.get("h") ?? (host === "vimeo.com" && /^[a-f0-9]{6,20}$/i.test(parts[at + 1] ?? "") ? parts[at + 1] : null);
    return { provider: "Vimeo", src: `https://player.vimeo.com/video/${parts[at]}?dnt=1${hash && /^[a-f0-9]{6,20}$/i.test(hash) ? `&h=${hash}` : ""}`, shape: "video" };
  }

  if (host === "loom.com") {
    // /share/<id>, also /share/<title-words>-<id>.
    const seg = parts[1] ?? "";
    const id = /([a-f0-9]{32})$/i.exec(seg)?.[1] ?? (/^[A-Za-z0-9]{10,64}$/.test(seg) ? seg : null);
    if (!["share", "embed"].includes(parts[0] ?? "") || !id) return null;
    return { provider: "Loom", src: `https://www.loom.com/embed/${id}`, shape: "video" };
  }

  return null;
}
