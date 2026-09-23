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
  const [r, g, b] = rgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 168 ? "#101614" : "#FFFFFF";
}

export function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}
