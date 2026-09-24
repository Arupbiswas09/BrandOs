export function rgb(hex: string): [number, number, number] {
  const h = String(hex || "#000").replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hex colour at a given alpha, as an rgba() string. */
export function hexA(hex: string, a: number): string {
  if (!hex || hex === "transparent") return "transparent";
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Black or white, whichever reads better on top of `hex`. */
export function onColor(hex: string): string {
  // White keeps saturated brands looking like themselves; ink, then black, when white cannot reach 4.5:1.
  if (contrast("#FFFFFF", hex) >= 4.5) return "#FFFFFF";
  if (contrast("#0F172A", hex) >= 4.5) return "#0F172A";
  return contrast("#000000", hex) > contrast("#FFFFFF", hex) ? "#000000" : "#FFFFFF";
}

export function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

function luminance(hex: string) {
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio between two colours (WCAG). */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * The same hue, darkened just enough to read as text (4.6:1) on a chip
 * filled with that colour at `tint` opacity over white.
 */
export function readable(hex: string, tint = 0.16): string {
  if (!hex || hex === "transparent" || hex.startsWith("var(")) return hex;
  const base = rgb(hex);
  const bg = "#" + base.map((c) => Math.round(255 - (255 - c) * tint).toString(16).padStart(2, "0")).join("");
  let [r, g, b] = base;
  const toHex = () => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  for (let i = 0; i < 24 && contrast(toHex(), bg) < 4.6; i++) { r *= 0.9; g *= 0.9; b *= 0.9; }
  return toHex();
}
