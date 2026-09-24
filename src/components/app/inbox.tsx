"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Bell, ChevronRight, UserRound, Users, X } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { markMentionsRead } from "@/app/actions";
import { useApp } from "./provider";
import { Avatar, DueBadge, cx } from "@/components/ui";
import { SpotArt } from "@/components/art";

export function Inbox() {
  const { inbox, setInbox } = useApp();
  if (!inbox) return null;
  return <Panel onClose={() => setInbox(false)} />;
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="m-0 mb-2.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute-4">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-md bg-soft text-accent [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        {title}
        {count !== undefined && <span className="rounded-full bg-chip px-1.5 py-px text-[11.5px] font-semibold normal-case tracking-normal text-mute-2">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { ws, openAsset } = useApp();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const meId = ws.me.id;
  const q = useMemo(() => ws.queue(), [ws]);
  const mine = q.filter((x) => x.who === meId);
  const others = q.filter((x) => x.who !== meId);
  const unread = useMemo(() => new Set(ws.d.unreadMentions), [ws]);
  const mentions = useMemo(
    () => ws.d.comments.filter((c) => c.mentions.includes(meId) && c.userId !== meId && !c.resolved).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20),
    [ws, meId],
  );

  // Focus lands inside the panel, and goes back where it came from on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  // Opening the inbox counts as reading the mentions in it.
  useEffect(() => {
    const ids = [...unread];
    if (!ids.length) return;
    const t = setTimeout(() => { void markMentionsRead(ids); }, 1200);
    return () => clearTimeout(t);
  }, [unread]);

  const openItem = (kind: string, id: string) => {
    onClose();
    if (kind === "asset") openAsset(id, "discussion");
    else router.push(href.offer(id) + "#discussion");
  };

  const nothing = !mine.length && !mentions.length && !others.length;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Inbox">
      <div className="absolute inset-0 animate-fade bg-[rgba(15,23,42,.28)]" onClick={onClose} />
      <div data-scroll className="absolute inset-y-0 right-0 flex w-[440px] max-w-full animate-slide flex-col overflow-y-auto border-l border-line bg-wash shadow-[-16px_0_44px_rgba(15,23,42,.12)]">
        <div className="safe-top sticky top-0 z-[2] border-b border-line bg-white/95 backdrop-blur-[8px]">
          <div className="flex items-center gap-3 px-5 py-4">
            <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-soft text-accent"><Bell className="h-[18px] w-[18px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold leading-tight tracking-[-0.012em]">Inbox</span>
              <span className="block text-[13.5px] text-mute-2">
                {mine.length ? `${mine.length} ${mine.length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
                {unread.size > 0 && ` · ${unread.size} new ${unread.size === 1 ? "mention" : "mentions"}`}
              </span>
            </span>
            <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-mute-2 transition-colors hover:bg-hover hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 pb-8 pt-5">
          {nothing ? (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <SpotArt kind="inbox" />
              <div className="mt-3 text-[16px] font-semibold">You are all caught up</div>
              <p className="m-0 mt-1 max-w-[34ch] text-[14.5px] text-mute-2 text-pretty">Work sent to you for review or changes, and notes that @mention you, show up here.</p>
            </div>
          ) : (
            <>
              <Section icon={<UserRound />} title="On you" count={mine.length}>
                <div className="flex flex-col gap-2">
                  {mine.map((x) => {
                    const c = x.act === "review" ? "#8A6A12" : "#C2410C";
                    return (
                      <button key={x.kind + x.id} type="button" onClick={() => openItem(x.kind, x.id)} className="lift w-full rounded-xl border border-line bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <span className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="rounded-[5px] px-2 py-0.5 text-[12.5px] font-semibold" style={{ background: hexA(c, 0.15), color: readable(c, 0.15) }}>{x.verb}</span>
                          <DueBadge at={x.dueAt} now={ws.d.now} />
                          <span className="flex-1" /><span className="text-[13px] text-mute-3">{x.ago}</span>
                        </span>
                        <span className="block text-[15.5px] font-semibold leading-[1.35]">{x.name}</span>
                        <span className="mt-0.5 block text-[14.5px] text-mute-2">{x.sub}</span>
                        {x.note && <span className="mt-2 block border-t border-divider pt-2 text-[14px] leading-[1.5] text-change-ink">{x.note}</span>}
                      </button>
                    );
                  })}
                  {!mine.length && <div className="rounded-xl border border-dashed border-line-strong bg-white/60 px-4 py-5 text-center text-[14.5px] text-mute-2">Nothing has your name on it.</div>}
                </div>
              </Section>

              {mentions.length > 0 && (
                <Section icon={<AtSign />} title="Mentions" count={mentions.length}>
                  <div className="flex flex-col gap-2">
                    {mentions.map((m) => {
                      const where = m.kind === "asset" ? ws.asset(m.itemId)?.name : ws.offer(m.itemId)?.name;
                      const isNew = unread.has(m.id);
                      return (
                        <button key={m.id} type="button" onClick={() => openItem(m.kind, m.itemId)} className={cx("lift flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left", isNew ? "border-accent/40 bg-soft" : "border-line bg-white")}>
                          <Avatar initials={ws.user(m.userId).initials} size={26} mono />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-3 block text-[14.5px] leading-[1.5] text-ink-3">{m.text}</span>
                            <span className="mt-1 block text-[13px] text-mute-3">{ws.first(m.userId)} · on {where} · {ws.ago(m.createdAt)}</span>
                          </span>
                          {isNew && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-change" role="img" aria-label="New" />}
                        </button>
                      );
                    })}
                  </div>
                </Section>
              )}

              <Section icon={<Users />} title={others.length ? "With other people" : "Nothing with anyone else"} count={others.length || undefined}>
                <div className="overflow-hidden rounded-xl border border-line bg-white">
                  {others.map((x) => (
                    <button key={x.kind + x.id} type="button" onClick={() => openItem(x.kind, x.id)} className="group flex w-full items-center gap-[11px] border-t border-divider px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-wash">
                      <Avatar initials={ws.user(x.who).initials} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium">{x.name}</span>
                        <span className="block text-[13px] text-mute-3">{x.verb} · {ws.first(x.who)}</span>
                      </span>
                      <ChevronRight aria-hidden className="h-4 w-4 flex-none text-mute-5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                  {!others.length && <div className="px-4 py-3 text-[14.5px] text-mute-3">Nobody else is holding anything up.</div>}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
