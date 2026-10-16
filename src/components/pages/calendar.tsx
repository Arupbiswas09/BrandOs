"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { useStored } from "@/lib/stored";
import { plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { Btn, Card, IconBtn, Page, PageHead, Select, cx } from "@/components/ui";
import { WEEK_STARTS_ON, fmtDate, fmtLongDate, fmtMonth } from "@/lib/format";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The weekday headings, starting on the house's first day of the week. */
const DAYS = Array.from({ length: 7 }, (_, i) => DAY_NAMES[(i + WEEK_STARTS_ON) % 7]);
const DAY = 86_400_000;
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

type View = "list" | "month";
const VIEWS: readonly View[] = ["list", "month"];

/*
 * Launches: when offers go live, across every brand you can see. This is
 * deliberately not a task calendar (ClickUp and Asana own deadlines), so
 * nothing here is "overdue". A launch date is a marketing fact.
 */
export function Calendar() {
  const { ws } = useApp();
  const router = useRouter();
  const today = new Date(ws.d.now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [view, setView] = useStored<View>("bos:launches-view", "list", VIEWS);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [brand, setBrand] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const all = useMemo(() => ws.launches(), [ws]);
  const items = useMemo(() => all.filter((x) => brand === "all" || ws.offer(x.id)?.brandId === brand), [all, ws, brand]);
  const byDay = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((x) => m.set(key(x.at), [...(m.get(key(x.at)) ?? []), x]));
    return m;
  }, [items]);

  const first = new Date(month);
  const lead = (first.getDay() - WEEK_STARTS_ON + 7) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weeks = cells.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? cells.slice(0, 35) : cells;

  const upcoming = items.filter((x) => x.at >= startOfToday && +x.at - +startOfToday < 30 * DAY);
  const recent = items.filter((x) => x.at < startOfToday && +startOfToday - +x.at <= 30 * DAY).reverse();
  const dayItems = selected ? byDay.get(selected) ?? [] : null;

  // Only brands that actually have a launch date are worth filtering by.
  const brandIds = [...new Set(all.map((x) => ws.offer(x.id)?.brandId).filter(Boolean))] as string[];
  const brandOptions = [{ value: "all", label: "Every brand" }, ...brandIds.map((id) => ({ value: id, label: ws.brand(id)?.name ?? "" }))];

  const when = (at: Date) => {
    const days = Math.round((+new Date(at.getFullYear(), at.getMonth(), at.getDate()) - +startOfToday) / DAY);
    const date = fmtDate(at, { short: true, now: ws.d.now });
    if (days === 0) return "Launches today";
    if (days === 1) return "Launches tomorrow";
    if (days > 1) return days <= 14 ? `Launches in ${plural(days, "day")}` : `Launches ${date}`;
    return `Launched ${date}`;
  };
  const shift = (n: number) => { setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); setSelected(null); };

  const row = (x: (typeof items)[number]) => (
    <button key={x.id} type="button" onClick={() => router.push(href.offer(x.id))} className="focus-inset flex min-h-14 w-full items-center gap-3 border-t border-divider px-4 py-2 text-left transition-colors duration-150 first:border-t-0 hover:bg-hover">
      <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: x.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium">{x.name}</span>
        <span className="block truncate text-meta text-mute-2">{x.sub}</span>
      </span>
      <span className="flex-none text-meta font-medium text-mute-1" suppressHydrationWarning>{when(x.at)}</span>
    </button>
  );

  const list = (id: string, title: string, rows: typeof items, none: string) => (
    <section aria-labelledby={id}>
      <h2 id={id} className="m-0 mb-2 flex items-baseline gap-2 text-body font-semibold text-ink">
        {title}{rows.length > 0 && <span className="text-meta font-normal tabular-nums text-mute-2">{rows.length}</span>}
      </h2>
      <Card className="overflow-hidden">
        {rows.map(row)}
        {!rows.length && <p className="m-0 px-5 py-6 text-center text-body text-mute-2">{none}</p>}
      </Card>
    </section>
  );

  return (
    <Page>
      <PageHead eyebrow="When offers go live" title="Launches"
        sub="Offer launch dates across every brand you can see. Set a launch date on any offer page. Tasks and deadlines stay in ClickUp."
        actions={
          <div role="group" aria-label="View" className="flex rounded-lg border border-line bg-surface p-0.5">
            {VIEWS.map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cx("h-8 rounded-md px-3 text-meta font-medium transition-colors duration-150", view === v ? "bg-soft font-semibold text-ink" : "text-mute-2 hover:text-ink")}>
                {v === "list" ? "List" : "Month"}
              </button>
            ))}
          </div>
        }
      />

      {(brandOptions.length > 2 || view === "month") && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {view === "month" && (
            <>
              <h2 className="m-0 mr-auto min-w-[160px] text-title font-semibold tracking-[-0.015em]">{fmtMonth(month)}</h2>
              <IconBtn label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></IconBtn>
              <Btn size="sm" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(null); }}>Today</Btn>
              <IconBtn label="Next month" onClick={() => shift(1)}><ChevronRight /></IconBtn>
            </>
          )}
          {brandOptions.length > 2 && (
            <Select aria-label="Brand" value={brand} onChange={(v) => { setBrand(v); setSelected(null); }} options={brandOptions}
              className={cx("w-auto py-1.5 pr-8 text-body", view === "month" && "sm:ml-2", brand !== "all" && "border-accent font-semibold text-accent")} />
          )}
        </div>
      )}

      {view === "list" ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-5">
          {list("launch-next", "Next 30 days", upcoming, "No launches in the next month.")}
          {list("launch-recent", "Launched recently", recent, "Nothing launched in the last month.")}
        </div>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-wash-2">
              {DAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-small font-semibold text-mute-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {weeks.map((d, i) => {
                const k = key(d);
                const on = byDay.get(k) ?? [];
                const inMonth = d.getMonth() === month.getMonth();
                const isToday = k === key(today);
                return (
                  <button key={i} type="button" onClick={() => setSelected(selected === k ? null : k)} aria-pressed={selected === k} aria-label={`${fmtLongDate(d)}, ${plural(on.length, "launch", "launches")}`}
                    className={cx("focus-inset flex min-h-14 flex-col items-stretch gap-1 border-b border-r border-divider p-1.5 text-left transition-colors duration-150 hover:bg-hover sm:min-h-24", !inMonth && "bg-wash-2", selected === k && "bg-soft outline-2 -outline-offset-2 outline-accent")}>
                    <span className={cx("self-start rounded-full px-1.5 text-small", isToday ? "bg-accent font-bold text-on-accent" : inMonth ? "text-ink-3" : "text-mute-2")}>{d.getDate()}</span>
                    <span className="hidden flex-col gap-1 sm:flex">
                      {on.slice(0, 3).map((x) => (
                        <span key={x.id} className="truncate rounded-sm px-1.5 py-0.5 text-micro font-medium" style={{ background: hexA(x.color, 0.12), color: readable(x.color, 0.3) }}>{x.name}</span>
                      ))}
                      {on.length > 3 && <span className="px-1 text-micro text-mute-2">+{on.length - 3} more</span>}
                    </span>
                    {on.length > 0 && (
                      <span className="flex gap-0.5 sm:hidden">{on.slice(0, 4).map((x) => <span key={x.id} className="h-1.5 w-1.5 rounded-full" style={{ background: x.color }} />)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
          {dayItems && (
            <section aria-labelledby="launch-day" className="mt-5">
              <h2 id="launch-day" className="m-0 mb-2 text-body font-semibold text-ink">{fmtLongDate(weeks.find((d) => key(d) === selected)!)}</h2>
              <Card className="overflow-hidden">
                {dayItems.map(row)}
                {!dayItems.length && <p className="m-0 px-5 py-6 text-center text-body text-mute-2">No launches that day.</p>}
              </Card>
            </section>
          )}
        </>
      )}

      <Link href="/settings?section=calendar" className="mt-6 inline-flex min-h-6 items-center gap-1.5 text-meta font-medium text-mute-2 hover:text-ink hover:underline">
        <CalendarPlus aria-hidden className="h-4 w-4" />Add launches to your calendar
      </Link>
    </Page>
  );
}
