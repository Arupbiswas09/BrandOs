"use client";

import { useStored } from "@/lib/stored";

/** Whether the desktop sidebar is full width or icons only. Remembered per browser. */
export function useNavMode(): ["full" | "mini", (v: "full" | "mini") => void] {
  return useStored<"full" | "mini">("bos.nav", "full", ["full", "mini"]);
}
