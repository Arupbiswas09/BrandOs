"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, History, Rocket, Rss } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { Btn, Card, H2, Page, PageHead, Pills, cx } from "@/components/ui";
import { CalendarFeedCard } from "@/components/calendar-feed";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY = 86_400_000;
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/*
 * Launches: when offers go live, across every brand you can see. This is
 * deliberately not a task calendar — ClickUp and Asana own deadlines — so
 * nothing here is "overdue". A launch date is a marketing fact.
 */
export function Calendar() {
  const { ws } = useApp();
  const router = useRouter();
  const today = new Date(ws.d.now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

  // Weeks start on Monday.
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
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
    const date = at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    if (days === 0) return "Launches today";
    if (days === 1) return "Launches tomorrow";
    if (days > 1) return days <= 14 ? `Launches in ${plural(days, "day")}` : `Launches ${date}`;
    return `Launched ${date}`;
  };

  const Row = ({ x }: { x: (typeof items)[number] }) => (
    <button type="button" onClick={() => router.push(href.offer(x.id))} className="focus-inset flex w-full items-center gap-3 border-t border-divider px-5 py-3 text-left transition-colors first:border-t-0 hover:bg-wash">
      <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: x.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{x.name}</span>
        <span className="block truncate text-[13.5px] text-mute-2">{x.sub}</span>
      </span>
      <span className="flex-none text-[13.5px] font-medium text-mute-1" suppressHydrationWarning>{when(x.at)}</span>
    </button>
  );

  return (
    <Page>
      <PageHead eyebrow="When offers go live" title="Launches"
        sub={<>Offer launch dates across every brand you can see. Set one under More detail on any offer. Tasks and deadlines stay in ClickUp.</>}
      />
      {brandOptions.length > 2 && <Pills className="mb-5" tone="dark" value={brand} onChange={(v) => { setBrand(v); setSelected(null); }} options={brandOptions} label="Brand" />}

      <div className="mb-7 grid gap-5 md:grid-cols-2">
        <div>
          <H2 icon={<Rocket />}>Next 30 days <Count n={upcoming.length} /></H2>
          <Card className="max-h-[320px] overflow-y-auto">
            {upcoming.map((x) => <Row key={x.id} x={x} />)}
            {!upcoming.length && <Quiet>No launches in the next month.</Quiet>}
          </Card>
        </div>
        <div>
          <H2 icon={<History />}>Launched recently <Count n={recent.length} /></H2>
          <Card className="max-h-[320px] overflow-y-auto">
            {recent.map((x) => <Row key={x.id} x={x} />)}
            {!recent.length && <Quiet>Nothing launched in the last month.</Quiet>}
          </Card>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <H2 icon={<CalendarRange />} className="mb-0 flex-1">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</H2>
        <Btn size="sm" aria-label="Previous month" className="px-2" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelected(null); }}><ChevronLeft className="h-4 w-4" /></Btn>
        <Btn size="sm" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(null); }}>Today</Btn>
        <Btn size="sm" aria-label="Next month" className="px-2" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelected(null); }}><ChevronRight className="h-4 w-4" /></Btn>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-wash-2">
          {DAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-[12.5px] font-semibold text-mute-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {weeks.map((d, i) => {
            const k = key(d);
            const list = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            const isToday = k === key(today);
            return (
              <button key={i} type="button" onClick={() => setSelected(selected === k ? null : k)} aria-label={`${d.toDateString()}, ${plural(list.length, "launch", "launches")}`}
                className={cx("focus-inset flex min-h-[60px] flex-col items-stretch gap-1 border-b border-r border-divider p-1.5 text-left transition-colors hover:bg-wash sm:min-h-[96px]", !inMonth && "bg-wash-2", selected === k && "bg-soft outline-2 -outline-offset-2 outline-accent")}>
                <span className={cx("self-start rounded-full px-1.5 text-[13px]", isToday ? "bg-accent font-bold text-on-accent" : inMonth ? "text-ink-3" : "text-mute-5")}>{d.getDate()}</span>
                <span className="hidden flex-col gap-1 sm:flex">
                  {list.slice(0, 3).map((x) => (
                    <span key={x.id} className="truncate rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: hexA(x.color, 0.12), color: readable(x.color, 0.3) }}>{x.name}</span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[12px] text-mute-3">+{list.length - 3} more</span>}
                </span>
                {list.length > 0 && (
                  <span className="flex gap-0.5 sm:hidden">{list.slice(0, 4).map((x) => <span key={x.id} className="h-1.5 w-1.5 rounded-full" style={{ background: x.color }} />)}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>
      {dayItems && (
        <div className="mt-5">
          <H2 icon={<CalendarDays />}>{new Date(weeks.find((d) => key(d) === selected)!).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</H2>
          <Card className="overflow-hidden">
            {dayItems.map((x) => <Row key={x.id} x={x} />)}
            {!dayItems.length && <Quiet>No launches that day.</Quiet>}
          </Card>
        </div>
      )}
      <H2 className="mt-7" icon={<Rss />}>In your own calendar</H2>
      <CalendarFeedCard />
    </Page>
  );
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-chip px-2 py-px text-[12.5px] font-semibold text-mute-2">{n}</span>;
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-center text-[14.5px] text-mute-3">{children}</div>;
}
