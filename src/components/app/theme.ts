import type { CSSProperties } from "react";
import { hexA, onColor, readable } from "@/lib/color";

export type Takeover = "bold" | "moderate" | "off";
export type Palette = "petrol" | "azure" | "cobalt" | "ocean" | "indigo";

/**
 * The house colours. Each is one action colour (buttons, links, focus) and
 * tints of it for "you are here", so nothing competes with the accent.
 * Petrol and its green-grey page are the Claude Design prototype's; the blue
 * ones are kept for people who prefer them (Settings → Appearance).
 */
export const PALETTES: Record<Palette, { name: string; note: string; accent: string; hl: string; hlInk: string; soft: string; tint: string; border: string }> = {
  petrol: { name: "Petrol", note: "The house colour: petrol blue on soft green-grey", accent: "#2D4A5C", hl: "#DFE6E9", hlInk: "#1F3542", soft: "#EDF2F0", tint: "#F7F9F8", border: "#E1E7E4" },
  azure: { name: "Azure", note: "Midnight navy", accent: "#0F2A5F", hl: "#DDE1E9", hlInk: "#0B1B3A", soft: "#EEF0F4", tint: "#F8FAFC", border: "#E2E8F0" },
  cobalt: { name: "Cobalt", note: "Royal blue", accent: "#1D4ED8", hl: "#DFE6FA", hlInk: "#1E3A8A", soft: "#EFF3FC", tint: "#F8FAFC", border: "#E2E8F0" },
  ocean: { name: "Ocean", note: "Deep sea", accent: "#0B4F6C", hl: "#DDE6EA", hlInk: "#083344", soft: "#EEF3F5", tint: "#F8FAFC", border: "#E2E8F0" },
  indigo: { name: "Indigo", note: "Night indigo", accent: "#312E81", hl: "#E2E2ED", hlInk: "#1E1B4B", soft: "#F1F0F6", tint: "#F8FAFC", border: "#E2E8F0" },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as Palette[];

/** CSS variables for the whole shell; inside a brand, that brand's colour leads. */
export function themeVars(brand: { primary: string; secondary: string } | null, mode: Takeover = "moderate", palette: Palette = "petrol"): CSSProperties {
  const p = PALETTES[palette] ?? PALETTES.petrol;
  const base = {
    "--bos-accent": p.accent,
    "--bos-accent2": p.hl,
    "--bos-on": onColor(p.accent),
    "--bos-soft": p.soft,
    "--bos-hl": p.hl,
    "--bos-hl-ink": p.hlInk,
    "--bos-tint": p.tint,
    "--bos-border": p.border,
  };
  if (!brand || mode === "off") return base as CSSProperties;
  // Accent is text and buttons, so a light brand colour is darkened (same hue) until it reads at 4.6:1 on the page and its tints.
  const accent = readable(brand.primary, 0.08);
  return {
    ...base,
    "--bos-accent": accent,
    "--bos-accent2": brand.secondary,
    "--bos-on": onColor(accent),
    "--bos-soft": hexA(brand.primary, 0.08),
    "--bos-hl": hexA(brand.primary, 0.16),
    "--bos-hl-ink": readable(brand.primary, 0.16),
    ...(mode === "bold" && { "--bos-tint": hexA(brand.primary, 0.035), "--bos-border": hexA(brand.primary, 0.16) }),
  } as CSSProperties;
}
