"use client";

import { useRef, useState, type DragEvent } from "react";
import { filesFromDrop } from "@/components/features/files/drop";

/**
 * Files dragged in from the desktop anywhere on a page section, handed over
 * as a list (folders opened where the browser allows). Drags inside the page,
 * such as a card onto a folder, carry no "Files" and are left alone, and so
 * is a drop the upload panel itself already took.
 *
 * While `enabled` is false a dropped file is still caught, so the browser
 * never navigates away to show it, but nothing is done with it.
 */
export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const files = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const bind = {
    onDragEnter: (e: DragEvent) => {
      if (!files(e)) return;
      depth.current += 1;
      if (enabled) setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      // The upload panel inside takes its own drops.
      if (!files(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = enabled ? "copy" : "none";
    },
    onDragLeave: (e: DragEvent) => {
      if (!files(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!files(e)) return;
      depth.current = 0;
      setOver(false);
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (!enabled) return;
      // The folder contents have to be asked for while the drop event is still running.
      void filesFromDrop(e.dataTransfer).then((list) => { if (list.length) onFiles(list); });
    },
  };
  return { over, bind };
}

/** The hint at the foot of the screen while files are held over a drop area. */
export function DropHint({ show, where }: { show: boolean; where: string }) {
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8">
      <span className="animate-fade rounded-full bg-ink px-4 py-2 text-meta font-medium text-white shadow-pop">Drop to add them to {where}</span>
    </div>
  );
}
