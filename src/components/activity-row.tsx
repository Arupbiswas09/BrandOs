"use client";

import type { Activity } from "@/db/schema";
import { useApp } from "@/components/app/provider";
import { Avatar } from "@/components/ui";

/**
 * One line of history that never hides the point: the change comes first
 * ("Status: Active → Archived"), then what it happened to and who did it.
 * Both lines wrap instead of cutting off.
 */
export function ActivityRow({ a, onOpen }: { a: Activity; onOpen?: () => void }) {
  const { ws } = useApp();
  const verb = a.action.charAt(0).toUpperCase() + a.action.slice(1);
  const change = a.field ? `${verb}: ${a.field}` : verb;
  const body = (
    <>
      <Avatar initials={ws.user(a.userId).initials} size={24} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[14.5px] font-medium leading-[1.4] text-ink">{change}</span>
        <span className="mt-0.5 block break-words text-[13.5px] leading-[1.4] text-mute-2">{a.label} · {ws.first(a.userId)} · {ws.ago(a.createdAt)}</span>
      </span>
    </>
  );
  const cls = "-mx-2 flex w-[calc(100%+16px)] items-start gap-2.5 rounded-[8px] border-t border-divider px-2 py-2.5 text-left first:border-t-0";
  return onOpen
    ? <button type="button" onClick={onOpen} className={`${cls} hover:bg-wash`}>{body}</button>
    : <div className={cls}>{body}</div>;
}
