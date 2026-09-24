import type { CSSProperties } from "react";
import { hexA, onColor, readable } from "@/lib/color";

export type Takeover = "bold" | "moderate" | "off";
export type Palette = "azure" | "cobalt" | "ocean" | "indigo";

/**
 * The house colours. Each pairs a deep action colour (buttons, links,
 * focus) with a bright highlight for "you are here" (the active nav pill).
 */
export const PALETTES: Record<Palette, { name: string; note: string; accent: string; hl: string; hlInk: string; soft: string }> = {
  azure: { name: "Azure", note: "Midnight navy with a sky highlight", accent: "#0F2A5F", hl: "#7DD3FC", hlInk: "#0B1B3A", soft: "#E0F2FE" },
  cobalt: { name: "Cobalt", note: "Royal blue with an ice highlight", accent: "#1D4ED8", hl: "#BFDBFE", hlInk: "#1E3A8A", soft: "#EFF6FF" },
  ocean: { name: "Ocean", note: "Deep sea with an aqua highlight", accent: "#0B4F6C", hl: "#67E8F9", hlInk: "#083344", soft: "#ECFEFF" },
  indigo: { name: "Indigo", note: "Night indigo with a periwinkle highlight", accent: "#312E81", hl: "#C7D2FE", hlInk: "#1E1B4B", soft: "#EEF2FF" },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as Palette[];

/** CSS variables for the whole shell; inside a brand, that brand's colour leads. */
export function themeVars(brand: { primary: string; secondary: string } | null, mode: Takeover = "moderate", palette: Palette = "azure"): CSSProperties {
  const p = PALETTES[palette] ?? PALETTES.azure;
  const base = {
    "--bos-accent": p.accent,
    "--bos-accent2": p.hl,
    "--bos-on": onColor(p.accent),
    "--bos-soft": p.soft,
    "--bos-hl": p.hl,
    "--bos-hl-ink": p.hlInk,
    "--bos-tint": "#F8FAFC",
    "--bos-border": "#E2E8F0",
  };
  if (!brand || mode === "off") return base as CSSProperties;
  return {
    ...base,
    "--bos-accent": brand.primary,
    "--bos-accent2": brand.secondary,
    "--bos-on": onColor(brand.primary),
    "--bos-soft": hexA(brand.primary, 0.08),
    "--bos-hl": hexA(brand.primary, 0.16),
    "--bos-hl-ink": readable(brand.primary, 0.16),
    ...(mode === "bold" && { "--bos-tint": hexA(brand.primary, 0.035), "--bos-border": hexA(brand.primary, 0.16) }),
  } as CSSProperties;
}
