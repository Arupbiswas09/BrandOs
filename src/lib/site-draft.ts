/*
 * "Start a brand from its website": reading a site's own HTML and CSS into a
 * draft brand kit (name, tagline, colours, fonts, logo, services) that a
 * person then checks. Plain tokenising, no browser and no dependencies, so
 * it is fast, predictable and testable with fixture pages.
 *
 * Nothing here touches the network on its own: `scanWith` is handed the
 * fetcher to use (src/server/site-scan.ts passes the guarded one).
 */

/* ================================================================ types */

export type SiteColour = { hex: string; score: number; from: string };
export type SiteFont = { name: string; role: string; weights: string; source: string; fallback: string };
export type SiteLogo = {
  url: string;
  kind: "logo" | "icon" | "social";
  label: string;
  /** A data: URL of the image itself, so the page never loads it from the other site. */
  preview: string;
  type: string;
  width?: number;
  height?: number;
};
export type SiteService = { name: string; oneLine: string };

export type SiteDraft = {
  url: string;
  host: string;
  name: string;
  tagline: string;
  description: string;
  voice: string;
  /** Ranked, most used first; primary and secondary are among them. */
  colours: SiteColour[];
  primary: string | null;
  secondary: string | null;
  fonts: SiteFont[];
  logos: SiteLogo[];
  services: SiteService[];
  segments: string[];
  /** What was found where, and how sure the guess is, in plain words. */
  notes: string[];
  /** The wording was tidied by Claude. */
  refined: boolean;
};

export type Fetched = { status: number; url: string; contentType: string; body: Uint8Array; truncated: boolean };
export type Fetcher = (url: string, opts: { maxBytes: number; timeoutMs: number; accept: string }) => Promise<Fetched>;

export class ScanError extends Error {}

/* ================================================================ HTML */

type El = { tag: string; attrs: Record<string, string>; kids: Node[]; parent: El | null; depth: number; raw?: string };
type Node = El | string;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "param"]);
const RAW = new Set(["script", "style", "title", "textarea"]);
const BLOCK = new Set(["div", "section", "article", "aside", "header", "footer", "nav", "main", "ul", "ol", "table", "form", "h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "figure"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", middot: "·", bull: "•", laquo: "«", raquo: "»", eacute: "é", egrave: "è",
  aacute: "á", agrave: "à", uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß", ccedil: "ç", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  pound: "£", euro: "€", times: "×", amp_: "&",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** A forgiving HTML reader: enough of a tree to ask where things are, never a validator. */
export function parseHtml(html: string): El {
  const root: El = { tag: "#root", attrs: {}, kids: [], parent: null, depth: 0 };
  let cur = root;
  let i = 0;
  const n = html.length;
  const lower = html.toLowerCase();
  const open = (tag: string, attrs: Record<string, string>) => {
    // The few implied closes that matter for reading text.
    if (tag === "p" || tag === "li" || tag === "option" || BLOCK.has(tag)) {
      if (cur.tag === "p" && (tag === "p" || BLOCK.has(tag))) cur = cur.parent ?? root;
      if (tag === "li") {
        let x: El | null = cur;
        while (x && x.tag !== "li" && x.tag !== "ul" && x.tag !== "ol" && x !== root) x = x.parent;
        if (x && x.tag === "li") cur = x.parent ?? root;
      }
      if (tag === "option" && cur.tag === "option") cur = cur.parent ?? root;
    }
    const el: El = { tag, attrs, kids: [], parent: cur, depth: cur.depth + 1 };
    cur.kids.push(el);
    return el;
  };
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { cur.kids.push(html.slice(i)); break; }
    if (lt > i) cur.kids.push(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(html.slice(lt, lt + 4000));
    if (!m) { cur.kids.push("<"); i = lt + 1; continue; }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    i = lt + m[0].length;
    if (closing) {
      let x: El | null = cur;
      while (x && x !== root && x.tag !== tag) x = x.parent;
      if (x && x !== root) cur = x.parent ?? root;
      continue;
    }
    const attrs = parseAttrs(m[3]);
    const selfClosed = /\/\s*$/.test(m[3]);
    if (tag === "svg") {
      const end = lower.indexOf("</svg>", i);
      const stop = end < 0 ? n : end + 6;
      const el = open(tag, attrs);
      el.raw = html.slice(lt, stop);
      i = stop;
      continue;
    }
    if (RAW.has(tag)) {
      const end = lower.indexOf(`</${tag}`, i);
      const stop = end < 0 ? n : end;
      const el = open(tag, attrs);
      el.raw = html.slice(i, stop);
      const gt = html.indexOf(">", stop);
      i = end < 0 ? n : gt < 0 ? n : gt + 1;
      continue;
    }
    const el = open(tag, attrs);
    // Pages that never close their tags would nest without end; past this depth they stay flat.
    if (!VOID.has(tag) && !selfClosed && el.depth < 200) cur = el;
  }
  return root;
}

/** Every element under `el`, in document order. */
function walk(el: El): El[] {
  const out: El[] = [];
  const stack: El[] = [];
  const push = (e: El) => { for (let k = e.kids.length - 1; k >= 0; k--) { const x = e.kids[k]; if (typeof x !== "string") stack.push(x); } };
  push(el);
  while (stack.length) {
    const e = stack.pop()!;
    out.push(e);
    push(e);
  }
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** "Big words Big words Big words" (one heading written out per screen size) read once. */
const once = (s: string) => /^(.{6,}?)(?: \1)+$/.exec(s)?.[1] ?? s;

export function textOf(el: El): string {
  const parts: string[] = [];
  const go = (e: El) => {
    for (const k of e.kids) {
      if (typeof k === "string") parts.push(k);
      else if (k.tag === "br") parts.push(" ");
      else if (k.tag !== "script" && k.tag !== "style" && k.tag !== "svg" && k.tag !== "template" && k.tag !== "noscript") {
        if (k.tag === "title" || k.tag === "textarea") parts.push(k.raw ?? "");
        else { parts.push(" "); go(k); parts.push(" "); }
      }
    }
  };
  if (el.raw !== undefined && (el.tag === "title" || el.tag === "textarea")) return squash(decodeEntities(el.raw));
  go(el);
  return squash(decodeEntities(parts.join("")));
}

const hintOf = (e: El) => `${e.attrs.class ?? ""} ${e.attrs.id ?? ""} ${e.attrs.role ?? ""}`.toLowerCase();

function ancestors(e: El, max = 40): El[] {
  const out: El[] = [];
  for (let x = e.parent; x && out.length < max; x = x.parent) out.push(x);
  return out;
}

const HEADER_HINT = /(^|[\s_-])(header|masthead|navbar|nav-bar|topbar|top-bar|site-head|site-header|banner)([\s_-]|$)/;
const inHeader = (e: El) => ancestors(e).some((a) => a.tag === "header" || a.tag === "nav" || a.attrs.role === "banner" || HEADER_HINT.test(hintOf(a)));
const inFooter = (e: El) => ancestors(e).some((a) => a.tag === "footer" || /(^|[\s_-])footer([\s_-]|$)/.test(hintOf(a)));

/* ================================================================ CSS */

type Rule = { selector: string; decls: [string, string][] };

/** Rules and their declarations; @media and similar wrappers are looked through. */
export function parseCss(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)/gi, "url()");
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    // Text before the selector can hold "@import …;" or "@charset …;" statements.
    const selector = squash(m[1].split(";").pop() ?? "");
    const decls: [string, string][] = [];
    for (const part of m[2].split(";")) {
      const c = part.indexOf(":");
      if (c < 1) continue;
      decls.push([part.slice(0, c).trim().toLowerCase(), part.slice(c + 1).trim()]);
    }
    out.push({ selector, decls });
  }
  return out;
}

/** Inline style="" attributes as declarations. */
function styleDecls(style: string): [string, string][] {
  return parseCss(`x{${style}}`)[0]?.decls ?? [];
}

/* ================================================================ colours */

type RGB = [number, number, number];

const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

function hsl([r, g, b]: RGB): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const pct = (v: string, scale: number) => (v.endsWith("%") ? (parseFloat(v) / 100) * scale : parseFloat(v));
const alphaOf = (v: string | undefined) => (v === undefined ? 1 : v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v));

/** Every solid colour written in a CSS value, as hex. Mostly transparent ones are left out. */
export function coloursIn(value: string): string[] {
  const out: string[] = [];
  const re = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])|rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)|hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    if (m[1]) {
      let h = m[1];
      if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
      if (h.length === 8) { if (parseInt(h.slice(6), 16) / 255 < 0.6) continue; h = h.slice(0, 6); }
      out.push("#" + h.toUpperCase());
    } else if (m[2]) {
      if (alphaOf(m[5]) < 0.6) continue;
      out.push(toHex([pct(m[2], 255), pct(m[3], 255), pct(m[4], 255)]));
    } else if (m[6]) {
      if (alphaOf(m[9]) < 0.6) continue;
      out.push(toHex(fromHsl(parseFloat(m[6]) % 360, parseFloat(m[7]) / 100, parseFloat(m[8]) / 100)));
    }
  }
  return out;
}

const rgbOf = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Near-white, near-black and greys say little about a brand. */
export function isNeutral(hex: string): boolean {
  const [, s, l] = hsl(rgbOf(hex));
  return l > 0.93 || l < 0.1 || s < 0.15 || (l > 0.85 && s < 0.3);
}

function close(a: string, b: string): boolean {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  if (d < 30) return true;
  const [h1, s1, l1] = hsl(x), [h2, s2, l2] = hsl(y);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return dh < 7 && Math.abs(l1 - l2) < 0.07 && Math.abs(s1 - s2) < 0.15;
}

/** A plain name for a colour ("Deep teal"), for the kit. */
export function colourName(hex: string): string {
  const [h, s, l] = hsl(rgbOf(hex));
  if (s < 0.15) return l > 0.9 ? "White" : l < 0.12 ? "Black" : l > 0.6 ? "Light grey" : "Grey";
  const names: [number, string][] = [[12, "Red"], [35, "Orange"], [48, "Amber"], [64, "Yellow"], [85, "Lime"], [150, "Green"], [188, "Teal"], [200, "Cyan"], [228, "Blue"], [250, "Indigo"], [278, "Violet"], [300, "Purple"], [330, "Magenta"], [348, "Pink"], [361, "Red"]];
  const base = names.find(([max]) => h < max)?.[1] ?? "Red";
  if (l < 0.3) return `Deep ${base.toLowerCase()}`;
  if (l > 0.72) return `Light ${base.toLowerCase()}`;
  return base;
}

type Tally = Map<string, { score: number; from: Set<string> }>;
const tallyAdd = (t: Tally, hex: string, score: number, from: string) => {
  const e = t.get(hex) ?? { score: 0, from: new Set<string>() };
  e.score += score;
  e.from.add(from);
  t.set(hex, e);
};

const BRANDY_VAR = /primary|brand|accent|main|theme|highlight|secondary|cta|action/;
const BRANDY_SELECTOR = /(^|[\s.#_-])(btn|button|cta|primary|brand|accent|hero|header|nav|link)([\s.:_-]|$)|(^|[\s,>+~])a([\s:.[,]|$)/i;

/** Counts colours across the site's CSS; brand-looking variables, buttons and links weigh more. */
function tallyColours(sheets: { rules: Rule[]; weight: number; from: string }[], t: Tally) {
  for (const { rules, weight, from } of sheets) {
    for (const r of rules) {
      if (r.selector.startsWith("@font-face")) continue;
      const boost = BRANDY_SELECTOR.test(r.selector) ? 2 : 0;
      for (const [p, v] of r.decls) {
        if (!(p.startsWith("--") || /color|background|border|fill|stroke|outline|shadow|^accent/.test(p))) continue;
        // WordPress lists its whole default palette as variables on every page; those are not the brand's.
        if (p.startsWith("--wp--preset") || p.startsWith("--wp-admin")) continue;
        const cols = coloursIn(v);
        if (!cols.length) continue;
        const varBoost = p.startsWith("--") && BRANDY_VAR.test(p) ? 10 : 0;
        const bg = /background/.test(p) ? 1 : 0;
        for (const c of cols) tallyAdd(t, c, weight * (1 + boost + bg) + varBoost, varBoost ? p : from);
      }
    }
  }
}

/** Ranked clusters of the brand-looking colours, with a primary and a secondary picked out. */
export function rankColours(t: Tally): { colours: SiteColour[]; primary: string | null; secondary: string | null } {
  const list = [...t.entries()].filter(([hex]) => !isNeutral(hex)).sort((a, b) => b[1].score - a[1].score);
  const clusters: { hex: string; score: number; from: Set<string> }[] = [];
  for (const [hex, e] of list) {
    const c = clusters.find((x) => close(x.hex, hex));
    if (c) { c.score += e.score; e.from.forEach((f) => c.from.add(f)); }
    else clusters.push({ hex, score: e.score, from: new Set(e.from) });
  }
  clusters.sort((a, b) => b.score - a.score);
  const top = clusters.slice(0, 12);
  const primary = top[0]?.hex ?? null;
  let secondary: string | null = null;
  if (primary) {
    const [ph, , pl] = hsl(rgbOf(primary));
    const distinct = top.slice(1).find((c) => {
      const [h, , l] = hsl(rgbOf(c.hex));
      const dh = Math.min(Math.abs(h - ph), 360 - Math.abs(h - ph));
      return dh >= 25 || Math.abs(l - pl) >= 0.25;
    });
    secondary = distinct?.hex ?? top[1]?.hex ?? null;
  }
  const ordered = [primary, secondary, ...top.map((c) => c.hex).filter((h) => h !== primary && h !== secondary)].filter((x): x is string => !!x).slice(0, 6);
  const colours = ordered.map((hex) => {
    const c = top.find((x) => x.hex === hex)!;
    const from = [...c.from];
    return { hex, score: Math.round(c.score), from: from.includes("theme colour") ? "theme colour" : from.find((f) => f.startsWith("--")) ?? from[0] ?? "styles" };
  });
  return { colours, primary, secondary };
}

/* ================================================================ fonts */

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "emoji", "math",
  "inherit", "initial", "unset", "revert", "-apple-system", "blinkmacsystemfont", "segoe ui", "segoe ui emoji", "segoe ui symbol", "apple color emoji",
  "noto color emoji", "helvetica", "helvetica neue", "arial", "arial black", "verdana", "tahoma", "trebuchet ms", "times", "times new roman", "georgia",
  "courier", "courier new", "sfmono-regular", "menlo", "monaco", "consolas", "liberation mono", "liberation sans", "lucida grande", "lucida console",
  "ubuntu", "cantarell", "oxygen", "oxygen-sans", "fira sans", "droid sans", "noto sans", "roboto", "open sans", "var",
]);
/** CSS words that can sit where a family name would. */
const FONT_KEYWORDS = new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large", "smaller", "larger", "caption", "icon", "menu", "message-box", "small-caption", "status-bar", "normal", "bold", "bolder", "lighter", "italic", "oblique", "none", "auto", "default"]);
const ICON_FONT = /awesome|fontawesome|icon|glyph|dashicons|eicons|icomoon|material symbols|material icons|slick|swiper|ionicons|feather|elegant|themify|linearicons|bootstrap-icons|socicon|star|wpzoom|revicons|fa-|fa brands|fa solid/i;

const fontKey = (n: string) => n.toLowerCase().replace(/\s+/g, " ").trim();
const firstFamily = (v: string) => v.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "").replace(/\s*!important$/i, "").trim()).filter(Boolean);

type FontTally = Map<string, { name: string; sources: Set<string>; heading: number; body: number; uses: number; weights: Set<string>; fallback: string; stacked: number }>;

function fontAdd(t: FontTally, raw: string, how: { source?: string; heading?: number; body?: number; uses?: number; weights?: string[]; fallback?: string; stacked?: boolean }) {
  const name = raw.replace(/^["']|["']$/g, "").trim();
  const k = fontKey(name);
  if (!k || k.length < 2 || k.length > 60 || GENERIC_FONTS.has(k) || FONT_KEYWORDS.has(k) || ICON_FONT.test(k) || /^var\(/.test(k)) return;
  const e = t.get(k) ?? { name, sources: new Set<string>(), heading: 0, body: 0, uses: 0, weights: new Set<string>(), fallback: "", stacked: 0 };
  if (how.stacked) e.stacked++;
  if (how.source) e.sources.add(how.source);
  e.heading += how.heading ?? 0;
  e.body += how.body ?? 0;
  e.uses += how.uses ?? 0;
  how.weights?.forEach((w) => e.weights.add(w));
  if (how.fallback && !e.fallback) e.fallback = how.fallback;
  t.set(k, e);
}

/** Families and weights in a Google Fonts (or Bunny Fonts) stylesheet address. */
export function fontsFromUrl(href: string): { name: string; weights: string[] }[] {
  let u: URL;
  try { u = new URL(href); } catch { return []; }
  const out: { name: string; weights: string[] }[] = [];
  for (const fam of u.searchParams.getAll("family")) {
    for (const one of fam.split("|")) {
      const [name, spec = ""] = one.split(":");
      if (!name.trim()) continue;
      let weights: string[] = [];
      if (spec.includes("@")) {
        const [axes, tuples] = spec.split("@");
        const names = axes.split(",");
        const wi = names.indexOf("wght");
        if (wi >= 0) weights = tuples.split(";").map((t) => t.split(",")[wi]).filter(Boolean).map((w) => w.replace("..", "–"));
      } else if (spec) weights = spec.split(",").map((w) => w.replace(/italic|i$/, "").trim()).filter((w) => /^\d{3}$/.test(w));
      out.push({ name: name.replace(/\+/g, " ").trim(), weights: [...new Set(weights)] });
    }
  }
  return out;
}

const HEADING_SEL = /(^|[\s,>+~(.#_-])(h[1-6]|heading|headline|title|display|hero)([\s,.:_\-[)]|$)/i;
const BODY_SEL = /(^|[\s,>+~(])(html|body|p|:root|main|article)([\s,.:[)]|$)|(^|[\s.#_-])(text|copy|content|body)([\s.:_-]|$)/i;

function tallyFonts(sheets: Rule[][], t: FontTally, sourceFor: (k: string) => string | undefined) {
  const vars = new Map<string, string>();
  for (const rules of sheets) for (const r of rules) for (const [p, v] of r.decls) if (p.startsWith("--") && !vars.has(p)) vars.set(p, v);
  const resolve = (v: string, depth = 0): string => v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, name: string, fb?: string) => (depth > 4 ? fb ?? "" : resolve(vars.get(name) ?? fb ?? "", depth + 1)));
  for (const rules of sheets) {
    for (const r of rules) {
      if (r.selector.startsWith("@font-face")) {
        const fam = r.decls.find(([p]) => p === "font-family")?.[1];
        const w = r.decls.find(([p]) => p === "font-weight")?.[1];
        if (fam) fontAdd(t, firstFamily(fam)[0] ?? "", { source: "self-hosted", weights: w && /^\d{3}/.test(w) ? [w.split(/\s+/)[0]] : [] });
        continue;
      }
      for (const [p, v] of r.decls) {
        let value = "";
        let heading = HEADING_SEL.test(r.selector);
        let body = BODY_SEL.test(r.selector);
        if (p === "font-family") value = resolve(v);
        else if (p === "font") {
          // The shorthand names a family only after its size ("600 1rem/1.4 Inter, sans-serif").
          const m = /(?:^|\s)[\d.]+(?:px|r?em|%|pt|vw|vh|ch)(?:\/\S+)?\s+(.+)$/.exec(resolve(v));
          if (!m) continue;
          value = m[1];
        }
        else if (p.startsWith("--") && /font|family|typeface/.test(p) && !/size|weight|style|feature|smooth|leading|track/.test(p)) {
          value = resolve(v);
          heading = /head|display|title|serif-alt/.test(p);
          body = /body|base|text|sans|copy|main|primary/.test(p) && !heading;
        } else continue;
        const fams = firstFamily(value);
        const first = fams[0];
        if (!first || /^\d/.test(first)) continue;
        const fallback = fams.slice(1).filter((f) => !/^var\(/.test(f)).slice(0, 4).join(", ");
        // A real family comes with fallbacks or quotes ("Inter", system-ui); a lone word may be anything.
        fontAdd(t, first, { heading: heading ? 1 : 0, body: body ? 1 : 0, uses: 1, fallback, source: sourceFor(fontKey(first)), stacked: fams.length > 1 || /["']/.test(value) });
      }
    }
  }
}

function rankFonts(t: FontTally, adobe: boolean): SiteFont[] {
  const list = [...t.values()].filter((f) => f.uses > 0 || f.sources.size > 0);
  // Fonts nobody's CSS uses are only kept when they were loaded on purpose (Google Fonts, Adobe).
  const used = list.filter((f) => (f.uses > 0 && (f.stacked > 0 || f.sources.size > 0)) || f.sources.has("Google Fonts") || f.sources.has("Bunny Fonts"));
  used.sort((a, b) => b.uses + b.heading * 2 + b.body * 2 - (a.uses + a.heading * 2 + a.body * 2));
  const heading = [...used].sort((a, b) => b.heading - a.heading)[0];
  const body = [...used].sort((a, b) => b.body - a.body)[0];
  return used.slice(0, 4).map((f) => {
    const isH = !!heading && heading.heading > 0 && heading === f;
    const isB = !!body && body.body > 0 && body === f;
    const role = isH && isB ? "Headings and body" : isH ? "Headings" : isB ? "Body" : used.length === 1 ? "All type" : "";
    const source = f.sources.has("Google Fonts") ? "Google Fonts" : f.sources.has("Bunny Fonts") ? "Bunny Fonts" : f.sources.has("self-hosted") ? "Self-hosted on the site" : adobe ? "Adobe Fonts (probably)" : "";
    const weights = [...f.weights].sort((a, b) => parseInt(a) - parseInt(b)).join(", ");
    return { name: f.name, role, weights, source, fallback: f.fallback || (/serif|garamond|playfair|lora|merriweather|baskerville|caslon|fraunces|cormorant|libre bask|crimson/i.test(f.name) && !/sans/i.test(f.name) ? "Georgia, serif" : "system-ui, sans-serif") };
  });
}

/* ================================================================ images */

/** What kind of image these bytes really are, whatever the server said. Null for anything else. */
export function sniffImage(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return "image/avif";
  if (at(0, 0x00, 0x00, 0x01, 0x00) && b.length > 22) return "image/x-icon";
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 2048))).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

export const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/x-icon": "ico", "image/svg+xml": "svg" };

/** Pixel size, where it is cheap to read. */
export function imageSize(b: Uint8Array, type: string): { width: number; height: number } | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  if (type === "image/png" && b.length > 24) return { width: u32(16), height: u32(20) };
  if (type === "image/gif" && b.length > 10) return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  if (type === "image/x-icon" && b.length > 8) return { width: b[6] || 256, height: b[7] || 256 };
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (type === "image/svg+xml") {
    const t = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096)));
    const tag = /<svg[^>]*>/i.exec(t)?.[0] ?? "";
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
    if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
    const w = /\swidth\s*=\s*["']?([\d.]+)/i.exec(tag), h = /\sheight\s*=\s*["']?([\d.]+)/i.exec(tag);
    return w && h ? { width: Math.round(+w[1]), height: Math.round(+h[1]) } : null;
  }
  return null;
}

function toBase64(b: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b).toString("base64");
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromDataUrl(url: string): Uint8Array | null {
  const m = /^data:([\w/+.-]+)?(;charset=[\w-]+)?(;base64)?,([\s\S]*)$/i.exec(url);
  if (!m) return null;
  try {
    if (m[3]) return typeof Buffer !== "undefined" ? new Uint8Array(Buffer.from(m[4], "base64")) : Uint8Array.from(atob(m[4]), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(m[4]));
  } catch {
    return null;
  }
}

/* ================================================================ reading a page */

export type PageFacts = {
  url: URL;
  title: string;
  metas: Record<string, string>;
  jsonLd: { name?: string; logo?: string; description?: string; slogan?: string };
  stylesheets: string[];
  fontLinks: string[];
  adobe: boolean;
  inlineCss: string[];
  styleAttrs: string[];
  svgColours: string[];
  logos: { url: string; kind: SiteLogo["kind"]; label: string; score: number }[];
  /** Headings and paragraphs in reading order. */
  blocks: { tag: string; text: string; serviceZone: boolean }[];
  nav: { label: string; href: string; parent: string | null }[];
};

/** A heading or menu label that introduces services ("Our services", "What we do"), not one that merely mentions a product. */
const SERVICE_WORDS = /^(?:our |the |all |explore (?:our )?|see (?:our |all )?|browse )?(?:services?|what we do|what we offer|how we (?:can )?help(?: you)?|solutions|offerings|expertise|capabilities|specialisms?|specialties|products|programmes|programs|treatments|practice areas|disciplines)\b/i;
const SERVICE_ZONE = /(^|[\s_-])(services?|offerings?|solutions|what-we-do|capabilit\w*|expertise|specialis\w*)([\s_-]|$)/;

function absolute(href: string, base: URL): string | null {
  if (!href || /^(javascript|mailto|tel|sms|#)/i.test(href.trim())) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "data:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function inlineSvgUrl(raw: string): string | null {
  if (raw.length > 200_000 || !/<(path|rect|circle|ellipse|polygon|polyline|text|image)\b/i.test(raw)) return null;
  const svg = /xmlns\s*=/.test(raw.slice(0, 300)) ? raw : raw.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(svg))}`;
}

export function readPage(html: string, pageUrl: string): PageFacts {
  const root = parseHtml(html);
  let base: URL = new URL(pageUrl);
  const facts: PageFacts = {
    url: base, title: "", metas: {}, jsonLd: {}, stylesheets: [], fontLinks: [], adobe: false, inlineCss: [], styleAttrs: [], svgColours: [], logos: [], blocks: [], nav: [],
  };
  const all = walk(root);
  const baseEl = all.find((e) => e.tag === "base" && e.attrs.href);
  if (baseEl) { try { base = new URL(baseEl.attrs.href, base); } catch { /* keep the page address */ } }
  const abs = (h: string) => absolute(h, base);

  for (const e of all) {
    switch (e.tag) {
      case "title": if (!facts.title) facts.title = textOf(e); break;
      case "meta": {
        const k = (e.attrs.property || e.attrs.name || "").toLowerCase();
        if (k && e.attrs.content && !(k in facts.metas)) facts.metas[k] = squash(e.attrs.content);
        break;
      }
      case "link": {
        const rel = (e.attrs.rel ?? "").toLowerCase();
        const href = abs(e.attrs.href ?? "");
        if (!href) break;
        if (/fonts\.googleapis\.com|fonts\.bunny\.net/.test(href)) facts.fontLinks.push(href);
        else if (/typekit\.net|use\.typekit|fonts\.adobe/.test(href)) facts.adobe = true;
        else if (rel.split(/\s+/).includes("stylesheet") || (rel.includes("preload") && e.attrs.as === "style")) facts.stylesheets.push(href);
        if (/apple-touch-icon/.test(rel)) facts.logos.push({ url: href, kind: "icon", label: "App icon", score: 50 });
        else if (/(^|\s)icon(\s|$)/.test(rel) || rel === "shortcut icon") {
          const size = parseInt((e.attrs.sizes ?? "").split("x")[0]) || 0;
          const svg = /svg/.test(e.attrs.type ?? "") || /\.svg(\?|$)/i.test(href);
          facts.logos.push({ url: href, kind: "icon", label: "Site icon", score: svg || size >= 96 ? 45 : 30 });
        } else if (rel === "mask-icon") facts.logos.push({ url: href, kind: "icon", label: "Site icon", score: 35 });
        break;
      }
      case "style": if (e.raw) facts.inlineCss.push(e.raw); break;
      case "script": {
        if (!/ld\+json/i.test(e.attrs.type ?? "") || !e.raw) break;
        try {
          const data = JSON.parse(e.raw.trim()) as unknown;
          const items: Record<string, unknown>[] = [];
          const collect = (x: unknown) => {
            if (Array.isArray(x)) x.forEach(collect);
            else if (x && typeof x === "object") {
              const o = x as Record<string, unknown>;
              items.push(o);
              if (o["@graph"]) collect(o["@graph"]);
            }
          };
          collect(data);
          const org = items.find((o) => /Organization|Corporation|LocalBusiness|NGO|Brand|Store|Agency|ProfessionalService/i.test(String(o["@type"] ?? "")));
          if (org) {
            const logo = org.logo;
            const logoUrl = typeof logo === "string" ? logo : logo && typeof logo === "object" ? String((logo as Record<string, unknown>).url ?? (logo as Record<string, unknown>).contentUrl ?? "") : "";
            facts.jsonLd = {
              name: typeof org.name === "string" ? squash(org.name) : undefined,
              description: typeof org.description === "string" ? squash(org.description) : undefined,
              slogan: typeof org.slogan === "string" ? squash(org.slogan) : undefined,
              logo: logoUrl ? abs(logoUrl) ?? undefined : undefined,
            };
            if (facts.jsonLd.logo) facts.logos.push({ url: facts.jsonLd.logo, kind: "logo", label: "Logo", score: 65 });
          }
        } catch { /* not JSON after all */ }
        break;
      }
    }
    if (e.attrs.style && facts.styleAttrs.length < 2000) facts.styleAttrs.push(e.attrs.style);
  }

  for (const k of ["og:image", "twitter:image"]) {
    const href = facts.metas[k] ? abs(facts.metas[k]) : null;
    if (href) facts.logos.push({ url: href, kind: "social", label: "Sharing image", score: k === "og:image" ? 25 : 20 });
  }

  // Logos: images and inline drawings that say "logo", or sit in the header inside a link home.
  const homePath = (h: string | undefined) => {
    if (!h) return false;
    try { const u = new URL(h, base); return u.host === base.host && (u.pathname === "/" || u.pathname === "" || /^\/(index\.\w+|home)?$/i.test(u.pathname)); } catch { return false; }
  };
  const LOGO = /logo|brand|wordmark|site-?title|masthead|site-?mark/i;
  for (const e of all) {
    if (e.tag !== "img" && e.tag !== "svg") continue;
    if (inFooter(e)) continue;
    const near = [e, ...ancestors(e, 3)];
    const hints = near.map((x) => `${hintOf(x)} ${x.attrs["aria-label"] ?? ""} ${x.attrs.title ?? ""}`).join(" ") + ` ${e.attrs.alt ?? ""} ${e.attrs.src ?? ""}`;
    const header = inHeader(e);
    const homeLink = ancestors(e, 4).some((a) => a.tag === "a" && homePath(a.attrs.href));
    const logoish = LOGO.test(hints);
    const score = logoish && header ? 100 : logoish ? 80 : header && homeLink ? 75 : 0;
    if (!score) continue;
    if (e.tag === "img") {
      const w = parseInt(e.attrs.width ?? ""), h = parseInt(e.attrs.height ?? "");
      if ((w && w <= 2) || (h && h <= 2)) continue;
      const src = e.attrs.src && !/^data:image\/gif/i.test(e.attrs.src) ? e.attrs.src : e.attrs["data-src"] || e.attrs["data-lazy-src"] || (e.attrs.srcset ?? "").split(",")[0]?.trim().split(/\s+/)[0] || "";
      const href = abs(src);
      if (href) facts.logos.push({ url: href, kind: "logo", label: header ? "Logo in the header" : "Logo", score });
    } else if (e.raw) {
      const href = inlineSvgUrl(e.raw);
      if (href) {
        facts.logos.push({ url: href, kind: "logo", label: header ? "Logo in the header" : "Logo", score: score - 5 });
        for (const m of e.raw.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)) facts.svgColours.push(...coloursIn(m[1]));
      }
    }
  }

  // Reading order, and whether each heading sits in a part of the page about services.
  for (const e of all) {
    if (!/^(h[1-4]|p|li)$/.test(e.tag)) continue;
    if (e.tag === "li" && !ancestors(e, 6).some((a) => a.tag === "main" || a.tag === "section" || a.tag === "article")) continue;
    if (inFooter(e) || (e.tag !== "h1" && inHeader(e))) continue;
    const text = once(textOf(e));
    if (!text || text.length > 600) continue;
    const zone = ancestors(e, 8).some((a) => SERVICE_ZONE.test(hintOf(a)));
    facts.blocks.push({ tag: e.tag, text, serviceZone: zone });
  }

  // The menu: top-level labels and what sits under each.
  const navs = all.filter((e) => e.tag === "nav" || e.attrs.role === "navigation" || (e.tag === "header" && !all.some((n) => n.tag === "nav")));
  const seenNav = new Set<string>();
  for (const nav of navs.slice(0, 3)) {
    if (inFooter(nav)) continue;
    for (const a of walk(nav)) {
      if (a.tag !== "a") continue;
      const label = textOf(a);
      const href = abs(a.attrs.href ?? "") ?? "";
      if (!label || label.length > 60) continue;
      // The label of the menu item this link sits under, if it is in a submenu.
      const lis = ancestors(a).filter((x) => x.tag === "li");
      let parent: string | null = null;
      if (lis.length > 1) {
        const top = lis[1];
        const own = top.kids.find((k): k is El => typeof k !== "string" && k.tag !== "ul" && k.tag !== "ol" && k.tag !== "div");
        parent = own ? textOf(own) : null;
      }
      const key = `${label}|${href}`;
      if (seenNav.has(key)) continue;
      seenNav.add(key);
      facts.nav.push({ label, href, parent });
    }
  }
  return facts;
}

/* ================================================================ services */

const GENERIC_LABEL = /^(home|homepage|accessibility help|instagram|linkedin|facebook|x|twitter|youtube|tiktok|pinterest|threads|mastodon|bluesky|vimeo|github|medium|archive|now|docs|documentation|changelog|customers|open app|app|get the app|download|downloads|community|developers|api|status|features|method|company|legal|security|integrations|sign out|start free|try free|try it free|book a demo|request a demo|demo|talk to sales|contact sales|explore|discover|shop now|donate now|ways to give|impact|our impact|stories|mission|our mission|values|history|leadership|trustees|annual report|about|about us|who we are|our story|team|our team|meet the team|people|contact|contact us|get in touch|talk to us|say hello|blog|news|insights|journal|articles|resources|events|careers|jobs|join us|work with us|login|log in|sign in|sign up|register|account|my account|privacy|privacy policy|terms|terms of use|cookies|cookie policy|accessibility|sitemap|faq|faqs|help|support|shop|store|cart|basket|checkout|search|menu|more|close|open menu|skip to content|back to top|book a call|book now|get started|learn more|read more|see more|view all|find out more|discover more|testimonials|reviews|case studies|our clients|clients|partners|press|media|newsletter|subscribe|follow us|donate|give|portfolio|work|our work|projects|pricing|prices|locations|english|en|services|our services|what we do|solutions|products)$/i;
const GENERIC_HEADING = /\b(clients? say|testimonials?|why (choose|us|work)|get in touch|contact|faqs?|frequently asked|latest|news|blog|subscribe|newsletter|follow us|our team|meet the|about us|how it works|our process|pricing|trusted by|as seen|awards?|partners|cookie|sign up|ready to|let'?s talk|start a project)\b/i;

const looseKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/s$/, "");
const firstSentence = (t: string, max = 140) => {
  const s = (/^(.{20,}?[.!?])(\s|$)/.exec(t)?.[1] ?? t).trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s;
};

function okService(name: string) {
  return name.length >= 3 && name.length <= 70 && !GENERIC_LABEL.test(name.trim()) && !GENERIC_HEADING.test(name) && !/[?]$/.test(name) && name.split(/\s+/).length <= 9;
}

/** Services named in the menu (under "Services" and the like) and in the parts of pages about services. */
export function findServices(home: PageFacts, pages: PageFacts[]): { services: SiteService[]; where: string[] } {
  const out: SiteService[] = [];
  const where = new Set<string>();
  const add = (name: string, oneLine = "", from: string) => {
    const n = squash(name).replace(/[→›»>]+\s*$/, "").trim();
    if (!okService(n)) return;
    const had = out.find((s) => looseKey(s.name) === looseKey(n));
    // The menu names a service; a heading further down often says what it is.
    if (had) { if (!had.oneLine && oneLine) had.oneLine = oneLine; return; }
    out.push({ name: n, oneLine });
    where.add(from);
  };
  const lineAfter = (blocks: PageFacts["blocks"], i: number) => {
    for (let j = i + 1; j < Math.min(blocks.length, i + 4); j++) {
      if (/^h/.test(blocks[j].tag)) break;
      if (blocks[j].tag === "p" && blocks[j].text.length >= 20) return firstSentence(blocks[j].text);
    }
    return "";
  };
  // 1. The menu: items under a "Services" or "What we do" parent.
  for (const n of home.nav) if (n.parent && SERVICE_WORDS.test(n.parent)) add(n.label, "", `the menu under ${n.parent}`);
  // 2. Headings under a services heading, or inside a services section.
  const fromBlocks = (p: PageFacts, label: string, servicePage: boolean) => {
    const b = p.blocks;
    let under = 0;
    for (let i = 0; i < b.length; i++) {
      const t = b[i].tag;
      if (t === "h1" || t === "h2") {
        under = SERVICE_WORDS.test(b[i].text) && b[i].text.length < 60 ? (t === "h1" ? 1 : 2) : 0;
        if (servicePage && t === "h2" && !under && !b.some((x) => x.tag === "h3")) add(b[i].text, lineAfter(b, i), label);
        continue;
      }
      if ((t === "h3" || t === "h4") && (under || b[i].serviceZone || servicePage)) add(b[i].text, lineAfter(b, i), label);
    }
  };
  fromBlocks(home, "the home page", false);
  for (const p of pages) fromBlocks(p, p.url.pathname, true);
  return { services: out.slice(0, 8), where: [...where] };
}

/* ================================================================ name, tagline, voice */

const GENERIC_TITLE = /^(home|homepage|home page|welcome|index|official site|official website|start|main)$/i;

export function cleanTitle(title: string): { name: string; rest: string } {
  const parts = title.split(/\s+[|·•–—:»/-]\s+|\s*\|\s*/).map((p) => p.replace(/^welcome to\s+/i, "").trim()).filter((p) => p && !GENERIC_TITLE.test(p));
  return { name: parts[0] ?? "", rest: parts.slice(1).join(" · ") };
}

function nameFromHost(host: string) {
  const core = host.replace(/^www\./, "").split(".")[0] ?? host;
  return core.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t);

/* ================================================================ the scan */

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";

function decode(f: Fetched): string {
  const fromHeader = /charset=([\w-]+)/i.exec(f.contentType)?.[1];
  const head = new TextDecoder("latin1").decode(f.body.subarray(0, 2048));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const label = (fromHeader || fromMeta || "utf-8").toLowerCase();
  try { return new TextDecoder(label).decode(f.body); } catch { return new TextDecoder("utf-8").decode(f.body); }
}

/** The site a host belongs to: "static.example.co.uk" and "www.example.co.uk" are both "example.co.uk". */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const short = parts[parts.length - 1].length === 2 && /^(co|com|org|net|ac|gov|edu|ltd|plc|sch|nhs|me)$/.test(parts[parts.length - 2]);
  return parts.slice(short ? -3 : -2).join(".");
}

/** Stylesheets and pages from the site itself, its subdomains included (static.example.org), never from elsewhere. */
const sameSite = (a: URL, b: URL) => siteOf(a.hostname) === siteOf(b.hostname);

const SERVICE_PATH = /\/(services?|what-?we-?do|what-?we-?offer|solutions?|offerings?|expertise|capabilities|how-?we-?help|our-?services|specialisms?|products?)(\/|$|\.html?$)/i;

export type ScanOptions = { budgetMs?: number; now?: () => number };

/**
 * Reads a site through `get`: the home page, up to three of its own
 * stylesheets, up to two pages about its services, and its logo candidates.
 * Everything stays within one time budget; anything that fails is left out
 * and noted rather than failing the scan.
 */
export async function scanWith(start: string, get: Fetcher, opts: ScanOptions = {}): Promise<{ draft: SiteDraft; digest: string }> {
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + (opts.budgetMs ?? 15_000);
  const left = () => deadline - now();
  const notes: string[] = [];

  const homeRes = await get(start, { maxBytes: 2_000_000, timeoutMs: Math.min(8000, left()), accept: HTML_ACCEPT });
  if (homeRes.status >= 400) throw new ScanError(`The site answered with an error (${homeRes.status}). Check the address, or fill the brand in by hand.`);
  if (homeRes.status >= 300) throw new ScanError("The site kept redirecting. Try its full address.");
  const html = decode(homeRes);
  if (!/html|xml/i.test(homeRes.contentType) && !/<html|<head|<body|<title/i.test(html.slice(0, 5000))) throw new ScanError("That address is not a web page. Paste the address of the site's home page.");
  const home = readPage(html, homeRes.url);
  if (homeRes.truncated) notes.push("The home page is very large, so only the first 2 MB was read.");

  // Stylesheets from the site itself, and pages that look like they describe services.
  const sheetUrls = [...new Set(home.stylesheets.filter((u) => sameSite(new URL(u), home.url)))].slice(0, 3);
  const pageUrls = [...new Set(home.nav.map((n) => n.href).filter((h) => {
    if (!h) return false;
    try { const u = new URL(h); return sameSite(u, home.url) && SERVICE_PATH.test(u.pathname) && u.pathname !== home.url.pathname; } catch { return false; }
  }).map((h) => h.replace(/#.*$/, "")))].slice(0, 2);

  const settle = async <T,>(work: Promise<T>): Promise<T | null> => { try { return await work; } catch { return null; } };
  const timeout = () => Math.max(500, Math.min(5000, left() - 2500));
  const [sheets, pages] = left() > 1500
    ? await Promise.all([
      Promise.all(sheetUrls.map((u) => settle(get(u, { maxBytes: 500_000, timeoutMs: timeout(), accept: "text/css,*/*;q=0.1" })))),
      Promise.all(pageUrls.map((u) => settle(get(u, { maxBytes: 1_000_000, timeoutMs: timeout(), accept: HTML_ACCEPT })))),
    ])
    : [[], []];
  if (left() <= 1500 && (sheetUrls.length || pageUrls.length)) notes.push("The site was slow, so its stylesheets and other pages were skipped.");
  const css = sheets.filter((r): r is Fetched => !!r && r.status < 300 && !/html/i.test(r.contentType)).map((r) => decode(r));
  if (sheetUrls.length && css.length < sheetUrls.length) notes.push(`${sheetUrls.length - css.length} of the site's stylesheets could not be read.`);
  const servicePages = pages.filter((r): r is Fetched => !!r && r.status < 300).map((r) => readPage(decode(r), r.url));

  // Colours.
  const tally: Tally = new Map();
  const sheetRules = css.map((c) => parseCss(c));
  const inlineRules = home.inlineCss.map((c) => parseCss(c));
  tallyColours([
    ...sheetRules.map((rules) => ({ rules, weight: 1, from: "styles" })),
    ...inlineRules.map((rules) => ({ rules, weight: 1, from: "styles" })),
    ...home.styleAttrs.map((s) => ({ rules: [{ selector: "[style]", decls: styleDecls(s) }], weight: 2, from: "page" })),
  ], tally);
  for (const c of home.svgColours) tallyAdd(tally, c, 6, "logo");
  const theme = home.metas["theme-color"] ? coloursIn(home.metas["theme-color"])[0] : undefined;
  if (theme && !isNeutral(theme)) tallyAdd(tally, theme, 25, "theme colour");
  const { colours, primary, secondary } = rankColours(tally);
  if (!colours.length) notes.push("No brand colours stood out (the site may be mostly black and white). Pick them below.");
  else if (theme && primary && close(theme, primary)) notes.push("The primary colour is the site's own theme colour.");
  else notes.push(`The colours are the ones the site's styles use most${css.length ? "" : " (its stylesheets could not be read, so only the page itself was used)"}.`);

  // Fonts.
  const ftally: FontTally = new Map();
  const loaded = new Map<string, string>();
  const importLinks = [...css, ...home.inlineCss].flatMap((c) => [...c.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+fonts\.(?:googleapis\.com|bunny\.net)[^"')\s;]*)/gi)].map((m) => m[1]));
  for (const href of [...home.fontLinks, ...importLinks]) {
    const source = /bunny/.test(href) ? "Bunny Fonts" : "Google Fonts";
    for (const f of fontsFromUrl(href)) {
      loaded.set(fontKey(f.name), source);
      fontAdd(ftally, f.name, { source, weights: f.weights });
    }
  }
  tallyFonts([...sheetRules, ...inlineRules, home.styleAttrs.slice(0, 500).map((s) => ({ selector: "[style]", decls: styleDecls(s) }))], ftally, (k) => loaded.get(k));
  const fonts = rankFonts(ftally, home.adobe);
  if (!fonts.length) notes.push("No web fonts were found; the site may use the system's own fonts.");
  else if (fonts.some((f) => !f.role)) notes.push("Check which font is for headings and which for body text.");

  // Name, tagline, description, voice.
  const host = home.url.hostname.replace(/^www\./, "");
  const t = cleanTitle(home.title);
  const siteName = home.metas["og:site_name"] || home.jsonLd.name || home.metas["application-name"] || "";
  const name = clip(siteName || t.name || nameFromHost(host), 200);
  if (siteName) notes.push("The name comes from the site's own name tag.");
  else if (t.name) notes.push("The name comes from the page title; check it is the brand and not a slogan.");
  else notes.push("The name was guessed from the web address.");

  const h1 = home.blocks.find((b) => b.tag === "h1")?.text ?? "";
  const metaDesc = home.metas["og:description"] || home.metas.description || home.metas["twitter:description"] || "";
  const sameAsName = (x: string) => looseKey(x) === looseKey(name);
  const tagline = clip([home.jsonLd.slogan, h1.length >= 6 && h1.length <= 90 && !sameAsName(h1) ? h1 : "", t.rest && t.rest.length <= 90 ? t.rest : "", metaDesc ? firstSentence(metaDesc, 120) : ""]
    .find((x): x is string => !!x && x.length >= 4) ?? "", 200);
  const firstPara = home.blocks.find((b) => b.tag === "p" && b.text.length >= 60)?.text ?? "";
  const description = clip(metaDesc || home.jsonLd.description || firstPara, 600);

  const h1At = home.blocks.findIndex((b) => b.tag === "h1");
  const hero: string[] = [];
  for (let i = Math.max(0, h1At); i < home.blocks.length && hero.length < 4; i++) {
    const b = home.blocks[i];
    if (i > h1At && /^h[12]$/.test(b.tag) && hero.length > 1) break;
    if (b.tag === "li") continue;
    const s = b.tag === "p" ? firstSentence(b.text, 180) : b.text;
    if (s.length >= (b.tag === "p" ? 25 : 12) && !hero.includes(s)) hero.push(s);
  }
  const voice = hero.length ? `How the site talks: ${hero.slice(0, 3).map((x) => `"${x.replace(/"/g, "'")}"`).join(" ")}` : "";
  if (voice) notes.push("The voice is quoted from the top of the home page. Describe it in your own words.");

  // Services.
  const svc = findServices(home, servicePages);
  let services = svc.services;
  if (services.length < 2) {
    const fallback = home.nav.filter((n) => {
      if (n.parent || !okService(n.label)) return false;
      try { return sameSite(new URL(n.href), home.url); } catch { return false; }
    }).slice(0, 6);
    for (const n of fallback) if (!services.some((s) => looseKey(s.name) === looseKey(n.label))) services.push({ name: n.label, oneLine: "" });
    services = services.slice(0, 8);
    if (fallback.length) notes.push("Few services were spelled out, so some come straight from the menu. Untick any that are not services.");
  }
  if (!services.length) notes.push("No services were found. Add them below, or later from the brand.");
  else if (svc.where.length) notes.push(`Services come from ${svc.where.slice(0, 3).join(", ")}.`);

  // Logo candidates, fetched here so the review never loads another site's images.
  const candidates: PageFacts["logos"] = [];
  for (const c of [...home.logos].sort((a, b) => b.score - a.score)) if (!candidates.some((x) => x.url === c.url)) candidates.push(c);
  if (!candidates.some((c) => c.kind === "icon")) candidates.push({ url: new URL("/favicon.ico", home.url).toString(), kind: "icon", label: "Site icon", score: 10 });
  const tryLogos = candidates.slice(0, 6);
  const logos: SiteLogo[] = [];
  const results = await Promise.all(tryLogos.map(async (c) => {
    if (c.url.startsWith("data:")) {
      const bytes = fromDataUrl(c.url);
      return bytes && bytes.length <= 300_000 ? { c, bytes } : null;
    }
    if (left() < 600) return null;
    const r = await settle(get(c.url, { maxBytes: 400_000, timeoutMs: Math.max(500, Math.min(4000, left() - 300)), accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8" }));
    return r && r.status < 300 && !r.truncated ? { c, bytes: r.body } : null;
  }));
  for (const r of results) {
    if (!r) continue;
    const type = sniffImage(r.bytes);
    if (!type) continue;
    const size = imageSize(r.bytes, type);
    if (size && r.c.kind === "icon" && size.width < 32 && results.some((x) => x && x !== r && x.c.kind !== "social")) continue;
    logos.push({ url: r.c.url, kind: r.c.kind, label: r.c.label, preview: `data:${type};base64,${toBase64(r.bytes)}`, type, ...(size ?? {}) });
    if (logos.length >= 4) break;
  }
  if (!logos.some((l) => l.kind === "logo")) notes.push(logos.length ? "No logo was found in the header, so the site icon and sharing image are offered instead." : "No logo could be downloaded. Upload one to the brand later.");

  const draft: SiteDraft = {
    url: home.url.toString(), host, name, tagline, description, voice, colours, primary, secondary, fonts, logos, services, segments: [], notes, refined: false,
  };

  // What an AI tidy-up may read: the site's words, never its markup.
  const digest = [
    `Address: ${home.url}`,
    `Page title: ${home.title}`,
    siteName && `Site name: ${siteName}`,
    metaDesc && `Description tag: ${metaDesc}`,
    home.jsonLd.slogan && `Slogan: ${home.jsonLd.slogan}`,
    home.nav.length && `Menu: ${home.nav.slice(0, 40).map((n) => (n.parent ? `${n.parent} > ${n.label}` : n.label)).join(" | ")}`,
    "Home page text:",
    ...home.blocks.slice(0, 120).map((b) => `${b.tag.toUpperCase()}: ${b.text}`),
    ...servicePages.flatMap((p) => [`Page ${p.url.pathname}:`, ...p.blocks.slice(0, 60).map((b) => `${b.tag.toUpperCase()}: ${b.text}`)]),
  ].filter(Boolean).join("\n").slice(0, 12_000);

  return { draft, digest };
}
