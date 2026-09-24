"use client";

import { useState } from "react";
import { createCalendarFeed, revokeCalendarFeed } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Card, cx } from "@/components/ui";

/**
 * A private link that Google Calendar, Apple Calendar or Outlook subscribe
 * to. Only a hash is stored, so the link is shown once, when it is made.
 */
export function CalendarFeedCard({ className }: { className?: string }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const [url, setUrl] = useState<string | null>(null);
  const feed = ws.d.calendarFeed;

  const make = async () => {
    if (feed && !window.confirm("Make a new calendar link? The old one stops working, so calendars using it stop updating.")) return;
    const r = await run(createCalendarFeed);
    if (r.ok && r.id) setUrl(r.id);
  };
  const revoke = async () => {
    if (!window.confirm("Turn off your calendar link? Calendars subscribed to it stop updating.")) return;
    const r = await run(revokeCalendarFeed);
    if (r.ok) { setUrl(null); toast("Calendar link turned off"); }
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast("Calendar link copied"); } catch { window.prompt("Copy this link", url); }
  };
  const when = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Card className={cx("mb-8 p-6", className)}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <div className="mb-1 text-[15px] font-semibold">Calendar feed</div>
          <p className="m-0 text-[15px] text-mute-1">
            See asset due dates and offer launches in Google Calendar, Apple Calendar or Outlook, with a reminder the day before.
            It shows only what you can see here, and updates on its own.
          </p>
          <p className="m-0 mt-2 text-[14px] text-mute-3" role="status">
            {url ? "Here is your link. Copy it now: for your security it is shown only once."
              : feed ? `Your link is on. Made ${when(feed.createdAt)}${feed.lastUsedAt ? `, last read by a calendar ${when(feed.lastUsedAt)}` : ", not used by a calendar yet"}. Lost it? Make a new one.`
              : "You have no calendar link yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant={feed ? "secondary" : "primary"} disabled={pending} onClick={make}>{feed ? "New link" : "Get a calendar link"}</Btn>
          {feed && <Btn variant="danger" disabled={pending} onClick={revoke}>Turn off</Btn>}
        </div>
      </div>
      {url && (
        <div className="mt-4 flex flex-col gap-2 border-t border-divider pt-4">
          <label className="block">
            <span className="label">Your private calendar link</span>
            <input readOnly className="field font-mono text-[13.5px]" value={url} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="primary" onClick={copy}>Copy link</Btn>
            <a href={url.replace(/^https?:/, "webcal:")} className="rounded-[8px] border border-line bg-white px-[13px] py-[7px] text-[15px] font-medium text-ink-3 hover:border-line-strong">Open in calendar app</a>
          </div>
          <p className="m-0 text-[14px] text-mute-3">
            Google Calendar: Other calendars → + → From URL, then paste. Apple Calendar: File → New Calendar Subscription.
            Anyone with the link can read these dates, so keep it to yourself.
          </p>
        </div>
      )}
    </Card>
  );
}
