import type { CSSProperties } from "react";
import { hexA, onColor } from "@/lib/color";
import { GLOBAL_ACCENT } from "@/lib/constants";

export type Takeover = "bold" | "moderate" | "off";

/** CSS variables that re-skin the UI in the colours of the brand you are standing in. */
export function themeVars(brand: { primary: string; secondary: string } | null, mode: Takeover = "bold"): CSSProperties {
  if (brand && mode !== "off") {
    return {
      "--bos-accent": brand.primary,
      "--bos-accent2": brand.secondary,
      "--bos-on": onColor(brand.primary),
      "--bos-soft": hexA(brand.primary, 0.09),
      "--bos-tint": mode === "bold" ? hexA(brand.primary, 0.045) : "#F7F9F8",
      "--bos-border": mode === "bold" ? hexA(brand.secondary, 0.3) : "#E1E7E4",
    } as CSSProperties;
  }
  return {
    "--bos-accent": GLOBAL_ACCENT,
    "--bos-accent2": "#7BA0A8",
    "--bos-on": onColor(GLOBAL_ACCENT),
    "--bos-soft": "#EDF2F0",
    "--bos-tint": "#F7F9F8",
    "--bos-border": "#E1E7E4",
  } as CSSProperties;
}
