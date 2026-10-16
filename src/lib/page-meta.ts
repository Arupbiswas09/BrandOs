/*
 * The picture a web page offers for sharing, read from its HTML head:
 * og:image first, then twitter:image, then <link rel="image_src">, then the
 * largest apple-touch-icon. Pure and regex based: it only reads tags, it
 * never runs or renders anything from the page.
 */

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decode(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([^\s=/"'<>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = decode((m[2] ?? m[3] ?? m[4] ?? "").trim());
  }
  return out;
}

const META_RANK: Record<string, number> = {
  "og:image:secure_url": 0, "og:image:url": 0, "og:image": 0,
  "twitter:image": 1, "twitter:image:src": 1,
};

/**
 * Picture addresses the page names, best first, as absolute http(s) URLs.
 * `pageUrl` is where the page was finally fetched from (after redirects).
 */
export function pictureCandidates(html: string, pageUrl: string): string[] {
  // Only the head matters, and a huge page should not make this slow.
  const end = html.search(/<\/head\s*>|<body[\s>]/i);
  const head = (end > 0 ? html.slice(0, end) : html).slice(0, 512_000).replace(/<!--[\s\S]*?-->/g, "");
  let base: URL;
  try { base = new URL(pageUrl); } catch { return []; }
  const baseTag = head.match(/<base\b[^>]*>/i);
  if (baseTag) {
    const href = attrs(baseTag[0].slice(5, -1)).href;
    try { if (href) base = new URL(href, base); } catch { /* keep the page address */ }
  }

  const found: { url: string; rank: number; size: number; order: number }[] = [];
  let order = 0;
  for (const m of head.matchAll(/<(meta|link)\b([^>]*)>/gi)) {
    const a = attrs(m[2]);
    if (m[1].toLowerCase() === "meta") {
      const key = (a.property || a.name || "").toLowerCase();
      const rank = META_RANK[key] ?? (a.itemprop?.toLowerCase() === "image" ? 2 : undefined);
      if (rank !== undefined && a.content) found.push({ url: a.content, rank, size: 0, order: order++ });
      continue;
    }
    const rel = (a.rel ?? "").toLowerCase().split(/\s+/);
    if (!a.href) continue;
    if (rel.includes("image_src")) found.push({ url: a.href, rank: 2, size: 0, order: order++ });
    else if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) {
      const size = Math.max(0, ...(a.sizes ?? "").split(/\s+/).map((s) => Number(s.toLowerCase().split("x")[0]) || 0));
      // Without a size an apple-touch-icon is 180px by convention.
      found.push({ url: a.href, rank: 3, size: size || 180, order: order++ });
    }
  }
  found.sort((x, y) => x.rank - y.rank || y.size - x.size || x.order - y.order);

  const out: string[] = [];
  for (const f of found) {
    try {
      const u = new URL(f.url, base);
      if ((u.protocol === "http:" || u.protocol === "https:") && !out.includes(u.toString())) out.push(u.toString());
    } catch { /* not an address */ }
  }
  return out;
}
