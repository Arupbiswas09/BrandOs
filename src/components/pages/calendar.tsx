"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Rss, TriangleAlert } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { useApp } from "@/components/app/provider";
import { Btn, Card, DueBadge, H2, Page, PageHead, Pills, cx } from "@/components/ui";
import { CalendarFeedCard } from "@/components/calendar-feed";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function Calendar() {
  const { ws, openAsset } = useApp();
  const router = useRouter();
  const today = new Date(ws.d.now);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [brand, setBrand] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const items = useMemo(() => ws.dated().filter((x) => {
    if (brand === "all") return true;
    const b = x.kind === "asset" ? ws.asset(x.id)?.brandId : ws.offer(x.id)?.brandId;
    return b === brand;
  }), [ws, brand]);
  const byDay = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((x) => m.set(key(x.dueAt), [...(m.get(key(x.dueAt)) ?? []), x]));
    return m;
  }, [items]);

  const open = (x: (typeof items)[number]) => (x.kind === "asset" ? openAsset(x.id) : router.push(href.offer(x.id)));

  // Weeks start on Monday.
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weeks = cells.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? cells.slice(0, 35) : cells;

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const overdue = items.filter((x) => !x.done && x.dueAt < startOfToday);
  const soon = items.filter((x) => !x.done && x.dueAt >= startOfToday && +x.dueAt - +startOfToday < 14 * 86400000);
  const dayItems = selected ? byDay.get(selected) ?? [] : null;

  const brandOptions = [{ value: "all", label: "Every brand" }, ...ws.d.brands.filter((b) => !b.archived).map((b) => ({ value: b.id, label: b.name }))];

  const Row = ({ x }: { x: (typeof items)[number] }) => (
    <button type="button" onClick={() => open(x)} className="focus-inset flex w-full items-center gap-3 border-t border-divider px-5 py-3 text-left transition-colors first:border-t-0 hover:bg-wash">
      <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: x.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{x.name}</span>
        <span className="block truncate text-[13.5px] text-mute-2">{x.sub}</span>
      </span>
      <DueBadge at={x.dueAt} now={ws.d.now} done={x.done} />
    </button>
  );

  return (
    <Page>
      <PageHead eyebrow="What is due" title="Calendar"
        sub={<>Asset deadlines and offer launches across every brand you can see. Set a date from any asset or offer.</>}
      />
      <Pills className="mb-5" tone="dark" value={brand} onChange={(v) => { setBrand(v); setSelected(null); }} options={brandOptions} label="Brand" />

      <div className="mb-7 grid gap-5 md:grid-cols-2">
        <div>
          <H2 icon={<TriangleAlert />}>Overdue <Count n={overdue.length} bad={overdue.length > 0} /></H2>
          <Card className="max-h-[320px] overflow-y-auto">
            {overdue.map((x) => <Row key={x.kind + x.id} x={x} />)}
            {!overdue.length && <Quiet>Nothing is late.</Quiet>}
          </Card>
        </div>
        <div>
          <H2 icon={<AlarmClock />}>Next two weeks <Count n={soon.length} /></H2>
          <Card className="max-h-[320px] overflow-y-auto">
            {soon.map((x) => <Row key={x.kind + x.id} x={x} />)}
            {!soon.length && <Quiet>Nothing due soon.</Quiet>}
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
              <button key={i} type="button" onClick={() => setSelected(selected === k ? null : k)} aria-label={`${d.toDateString()}, ${list.length} due`}
                className={cx("focus-inset flex min-h-[60px] flex-col items-stretch gap-1 border-b border-r border-divider p-1.5 text-left transition-colors hover:bg-wash sm:min-h-[96px]", !inMonth && "bg-wash-2", selected === k && "bg-soft outline-2 -outline-offset-2 outline-accent")}>
                <span className={cx("self-start rounded-full px-1.5 text-[13px]", isToday ? "bg-accent font-bold text-on-accent" : inMonth ? "text-ink-3" : "text-mute-5")}>{d.getDate()}</span>
                <span className="hidden flex-col gap-1 sm:flex">
                  {list.slice(0, 3).map((x) => (
                    <span key={x.kind + x.id} className="truncate rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: hexA(x.color, 0.12), color: readable(x.color, 0.3), textDecoration: x.done ? "line-through" : undefined }}>{x.name}</span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[12px] text-mute-3">+{list.length - 3} more</span>}
                </span>
                {list.length > 0 && (
                  <span className="flex gap-0.5 sm:hidden">{list.slice(0, 4).map((x) => <span key={x.kind + x.id} className="h-1.5 w-1.5 rounded-full" style={{ background: x.color }} />)}</span>
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
            {dayItems.map((x) => <Row key={x.kind + x.id} x={x} />)}
            {!dayItems.length && <Quiet>Nothing due that day.</Quiet>}
          </Card>
        </div>
      )}
      <H2 className="mt-7" icon={<Rss />}>In your own calendar</H2>
      <CalendarFeedCard />
    </Page>
  );
}

function Count({ n, bad }: { n: number; bad?: boolean }) {
  return <span className={cx("rounded-full px-2 py-px text-[12.5px] font-semibold", bad ? "bg-[#FEE4E2] text-[#B42318]" : "bg-chip text-mute-2")}>{n}</span>;
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center gap-2 px-5 py-6 text-center text-[14.5px] text-mute-3"><CheckDot />{children}</div>;
}

function CheckDot() {
  return <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />;
}
