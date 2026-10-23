/*
 * Which pasted links BrandOS can preview inside the page, and the exact
 * address each one is framed from. Only these six origins are allowed as
 * frame sources in the Content-Security-Policy (src/proxy.ts), so this list
 * and that one have to change together.
 *
 *   Figma                  https://www.figma.com/embed
 *   Google Docs/Sheets/…   https://docs.google.com/…/preview (published files: …/pub?embedded=true)
 *   Google Forms           https://docs.google.com/forms/…/viewform?embedded=true
 *   Google Drive files     https://drive.google.com/file/d/…/preview
 *   Google Drive folders   https://drive.google.com/embeddedfolderview?id=…#list
 *   YouTube                https://www.youtube-nocookie.com/embed/…   (no tracking cookies until play)
 *   Vimeo                  https://player.vimeo.com/video/…?dnt=1     (do not track)
 *   Loom                   https://www.loom.com/embed/…
 *
 * A PDF on any other website cannot be framed (the policy and, usually, the
 * site itself refuse it), so `linkPreview` names it as a PDF and the screen
 * offers to open it instead.
 */

export type EmbedProvider =
  | "Figma" | "Google Docs" | "Google Sheets" | "Google Slides" | "Google Forms" | "Google Drive"
  | "YouTube" | "Vimeo" | "Loom";

/** What the link is, whoever hosts it. */
export type EmbedKind = "doc" | "sheet" | "slides" | "form" | "folder" | "file" | "video" | "playlist" | "design";

export type Embed = {
  provider: EmbedProvider;
  kind: EmbedKind;
  /** What it is in a word or two, for cards and the preview: "Google Doc", "Drive folder", "YouTube video". */
  label: string;
  /** The button that opens the original: "Open in Google Docs", "Open on YouTube". */
  open: string;
  /** The address to frame. Always https, always one of the allowed origins. */
  src: string;
  /** Video plays at 16:9, Shorts stand at 9:16; documents and designs get a taller 16:10 frame. */
  shape: "video" | "portrait" | "page";
  /** Google files show only to people signed in to Google with access, so the screen says so. */
  signIn: boolean;
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
/** Google file and folder ids: 19 (a shared drive) to 44 (a Doc), longer for published files ("2PACX-…"). */
const GID = /^[A-Za-z0-9_-]{19,160}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{12,64}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[a-f0-9]{6,20}$/i;

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/**
 * A Google path without the parts that only say which account or app view
 * it was copied from: the account slot ("/u/2/", "/b/1/"), an old Workspace
 * domain ("/a/agency.org/") and Drive's phone view ("/mobile/").
 *   /drive/u/2/mobile/folders/ID → /drive/folders/ID
 *   /a/agency.org/document/u/1/d/ID/edit → /document/d/ID/edit
 */
function googleParts(parts: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], next = parts[i + 1] ?? "";
    if ((p === "u" || p === "b") && /^(\d{1,2}|[^/@]+@[^/]+)$/.test(next)) { i++; continue; }
    if (p === "a" && out.length === 0 && next.includes(".")) { i++; continue; }
    if (p === "mobile") continue;
    out.push(p);
  }
  return out;
}

/** "?resourcekey=…" for Drive files shared by link before 2021, which need it to open; empty otherwise. */
function resourceKey(u: URL, joiner: "?" | "&" = "?"): string {
  const k = u.searchParams.get("resourcekey");
  return k && /^[A-Za-z0-9_-]{1,100}$/.test(k) ? `${joiner}resourcekey=${k}` : "";
}

const GOOGLE_APPS = {
  document: { provider: "Google Docs", kind: "doc", label: "Google Doc" },
  spreadsheets: { provider: "Google Sheets", kind: "sheet", label: "Google Sheet" },
  presentation: { provider: "Google Slides", kind: "slides", label: "Google Slides" },
  forms: { provider: "Google Forms", kind: "form", label: "Google Form" },
} as const satisfies Record<string, { provider: EmbedProvider; kind: EmbedKind; label: string }>;

const OPEN: Record<EmbedProvider, string> = {
  Figma: "Open in Figma", "Google Docs": "Open in Google Docs", "Google Sheets": "Open in Google Sheets",
  "Google Slides": "Open in Google Slides", "Google Forms": "Open in Google Forms", "Google Drive": "Open in Google Drive",
  YouTube: "Open on YouTube", Vimeo: "Open on Vimeo", Loom: "Open in Loom",
};

const embed = (provider: EmbedProvider, kind: EmbedKind, label: string, src: string, shape: Embed["shape"]): Embed => ({
  provider, kind, label, open: OPEN[provider], src, shape, signIn: provider.startsWith("Google"),
});

const driveFile = (id: string, u: URL) => embed("Google Drive", "file", "Drive file", `https://drive.google.com/file/d/${id}/preview${resourceKey(u)}`, "page");
const driveFolder = (id: string, u: URL) => embed("Google Drive", "folder", "Drive folder", `https://drive.google.com/embeddedfolderview?id=${id}${resourceKey(u, "&")}#list`, "page");
const queryId = (u: URL) => { const id = u.searchParams.get("id"); return id && GID.test(id) ? id : null; };

/** docs.google.com: Docs, Sheets, Slides and Forms, as shared or as published, and the older Drive file forms. */
function googleDocs(u: URL, parts: string[]): Embed | null {
  const p = googleParts(parts);
  const app = p[0] as keyof typeof GOOGLE_APPS | "file" | "open" | "uc";
  if (app === "file" && p[1] === "d" && GID.test(p[2] ?? "")) return driveFile(p[2], u);
  if ((app === "open" || app === "uc") && queryId(u)) return driveFile(queryId(u)!, u);
  const g = GOOGLE_APPS[app as keyof typeof GOOGLE_APPS];
  if (!g || p[1] !== "d") return null;
  const make = (src: string) => embed(g.provider, g.kind, g.label, src, "page");
  // Published to the web ("File → Share → Publish"): /d/e/2PACX-…/pub, …/pubhtml, …/viewform.
  if (p[2] === "e" && GID.test(p[3] ?? "")) {
    const id = p[3];
    if (app === "document") return make(`https://docs.google.com/document/d/e/${id}/pub?embedded=true`);
    if (app === "spreadsheets") return make(`https://docs.google.com/spreadsheets/d/e/${id}/pubhtml?widget=true&headers=false`);
    if (app === "presentation") return make(`https://docs.google.com/presentation/d/e/${id}/embed?start=false&loop=false`);
    return make(`https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`);
  }
  if (!GID.test(p[2] ?? "")) return null;
  const id = p[2];
  if (app === "forms") return make(`https://docs.google.com/forms/d/${id}/viewform?embedded=true`);
  // A Word or Excel file kept in Drive and opened in Docs (?rtpof=true) previews as the Drive file it is.
  if (u.searchParams.get("rtpof") === "true") return { ...driveFile(id, u), provider: g.provider, kind: g.kind, label: g.label, open: OPEN[g.provider] };
  return make(`https://docs.google.com/${app}/d/${id}/preview${resourceKey(u)}`);
}

/** drive.google.com and drive.usercontent.google.com: files, folders and the older ?id= links. */
function googleDrive(u: URL, host: string, parts: string[]): Embed | null {
  const p = googleParts(parts);
  if (host === "drive.usercontent.google.com") return ["download", "uc", "open"].includes(p[0] ?? "") && queryId(u) ? driveFile(queryId(u)!, u) : null;
  if (p[0] === "file" && p[1] === "d" && GID.test(p[2] ?? "")) return driveFile(p[2], u);
  if (p[0] === "drive" && p[1] === "folders" && GID.test(p[2] ?? "")) return driveFolder(p[2], u);
  if (p[0] === "folderview" || p[0] === "embeddedfolderview") return queryId(u) ? driveFolder(queryId(u)!, u) : null;
  // drive.google.com/open?id=…, /uc?id=…&export=download: almost always a file.
  if (["open", "uc", "thumbnail"].includes(p[0] ?? "") && queryId(u)) return driveFile(queryId(u)!, u);
  return null;
}

function youTube(u: URL, host: string, parts: string[]): Embed | null {
  const list = u.searchParams.get("list");
  if (parts[0] === "playlist" || (parts[0] === "watch" && !u.searchParams.get("v"))) {
    return list && YT_LIST.test(list) ? embed("YouTube", "playlist", "YouTube playlist", `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`, "video") : null;
  }
  let id: string | null = null;
  if (host === "youtu.be") id = parts[0] ?? null;
  else if (parts[0] === "watch") id = u.searchParams.get("v");
  else if (["shorts", "embed", "live", "v", "e"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  if (!id || !YT_ID.test(id)) return null;
  // ?t=90, ?t=1m30s, ?start=90, or #t=90 on older links.
  const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start") ?? new URLSearchParams(u.hash.slice(1)).get("t"));
  const short = parts[0] === "shorts";
  return embed("YouTube", "video", short ? "YouTube Short" : "YouTube video", `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`, short ? "portrait" : "video");
}

function vimeo(u: URL, host: string, parts: string[]): Embed | null {
  // Live events and showcases play from vimeo.com itself, which is not framed; a video inside a showcase is.
  const at = (() => {
    const v = parts.findIndex((p, i) => (p === "video" || p === "videos") && VIMEO_ID.test(parts[i + 1] ?? ""));
    if (v >= 0) return v + 1;
    if (["event", "events", "showcase", "album", "ondemand", "live"].includes(parts[0] ?? "")) return -1;
    // vimeo.com/channels/<name>/123: the channel's name may be a number too.
    if (parts[0] === "channels") return VIMEO_ID.test(parts[2] ?? "") ? 2 : -1;
    return parts.findIndex((p) => VIMEO_ID.test(p));
  })();
  if (at < 0) return null;
  // Unlisted videos carry a hash: vimeo.com/123/abcdef or ?h=abcdef.
  const hash = u.searchParams.get("h") ?? (host === "vimeo.com" ? parts[at + 1] ?? null : null);
  return embed("Vimeo", "video", "Vimeo video", `https://player.vimeo.com/video/${parts[at]}?dnt=1${hash && VIMEO_HASH.test(hash) ? `&h=${hash}` : ""}`, "video");
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
    return embed("Figma", "design", "Figma file", `https://www.figma.com/embed?embed_host=brandos&url=${encodeURIComponent(clean.href)}`, "page");
  }

  if (host === "docs.google.com") return googleDocs(u, parts);
  if (host === "drive.google.com" || host === "drive.usercontent.google.com") return googleDrive(u, host, parts);

  if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return youTube(u, host, parts);

  if (host === "vimeo.com" || host === "player.vimeo.com") return vimeo(u, host, parts);

  if (host === "loom.com") {
    // /share/<id>, also /share/<title-words>-<id>.
    const seg = parts[1] ?? "";
    const id = /([a-f0-9]{32})$/i.exec(seg)?.[1] ?? (/^[A-Za-z0-9]{10,64}$/.test(seg) ? seg : null);
    if (!["share", "embed"].includes(parts[0] ?? "") || !id) return null;
    return embed("Loom", "video", "Loom video", `https://www.loom.com/embed/${id}`, "video");
  }

  return null;
}

/** A link to a PDF file on a website other than the ones we frame. */
function isPdfLink(u: URL): boolean {
  let path = u.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep it encoded */ }
  return /\.pdf$/i.test(path);
}

/**
 * What a link can show in the page: a framed preview, or (for a PDF on some
 * other website, which cannot be framed) a card that opens it. Null for an
 * ordinary web page.
 */
export function linkPreview(raw: string | null | undefined): { type: "embed"; embed: Embed } | { type: "pdf"; href: string } | null {
  const u = webUrl(raw);
  if (!u) return null;
  const e = linkEmbed(u.href);
  if (e) return { type: "embed", embed: e };
  return isPdfLink(u) ? { type: "pdf", href: u.href } : null;
}

/**
 * What a link is, in a word or two for a card or a row, beside the asset's
 * type: "YouTube", "Loom", "Google Doc", "Drive folder", "PDF". Null for an
 * ordinary web page.
 */
export function linkSource(raw: string | null | undefined): { label: string; kind: EmbedKind | "pdf"; open: string } | null {
  const p = linkPreview(raw);
  if (!p) return null;
  if (p.type === "pdf") return { label: "PDF", kind: "pdf", open: "Open the PDF" };
  const e = p.embed;
  // "Video · YouTube" reads better than "Video · YouTube video"; a Short or a playlist keeps its word.
  return { label: e.label.endsWith(" video") ? e.provider : e.label, kind: e.kind, open: e.open };
}
