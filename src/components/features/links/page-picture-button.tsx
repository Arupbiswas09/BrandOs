"use client";

import { Globe } from "lucide-react";
import type { Asset } from "@/db/schema";
import { usePagePicture as takePagePicture } from "@/app/link-actions";
import { useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";
import { useRun } from "./use-run";

/*
 * "Use the page's picture": sets the card picture to the image the asset's
 * page offers for sharing (its og:image). Shown only to people who could
 * upload a thumbnail for this asset, and only when it has a link.
 */

/** Whether I may take the page's picture for this asset. The server checks the same again. */
export function canUsePagePicture(ws: ReturnType<typeof useApp>["ws"], asset: Asset) {
  return !!asset.url.trim() && ws.d.uploadsEnabled && ws.can("upload") && ws.canChange(asset) && (!!asset.brandId || ws.can("library"));
}

export function PagePictureButton({ asset, onDone, variant = "button", className }: {
  asset: Asset;
  /** Called after the picture is set, for closing the menu or panel it sits in. */
  onDone?: () => void;
  /** "menuitem" is a full-width row for a menu or the thumbnail panel. */
  variant?: "button" | "menuitem";
  className?: string;
}) {
  const { ws, toast } = useApp();
  const [run, pending] = useRun();
  if (!canUsePagePicture(ws, asset)) return null;
  const go = async () => {
    const r = await run(() => takePagePicture(asset.id));
    if (!r) return;
    toast("Picture taken from the page");
    onDone?.();
  };
  const label = pending ? "Fetching the page…" : "Use the page's picture";

  if (variant === "menuitem") {
    return (
      <button type="button" onClick={go} disabled={pending} aria-busy={pending || undefined}
        className={cx("flex min-h-9 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-body font-medium text-ink hover:bg-wash disabled:cursor-wait disabled:opacity-60", className)}>
        <Globe aria-hidden size={16} className="flex-none text-mute-2" />
        {label}
      </button>
    );
  }
  return (
    <Btn size="sm" variant="secondary" onClick={go} disabled={pending} aria-busy={pending || undefined} className={className}>
      <Globe aria-hidden size={15} />
      {label}
    </Btn>
  );
}
