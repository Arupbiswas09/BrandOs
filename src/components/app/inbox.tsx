"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AtSign, ChevronRight, Inbox as InboxIcon, UserRound, Users, X } from "lucide-react";
import { href } from "@/lib/routes";
import type { QueueItem, WS } from "@/lib/ws";
import { markMentionsRead } from "@/app/actions";
import { useApp } from "./provider";
import { Avatar, IconBtn, PILL, cx } from "@/components/ui";

type Note = WS["d"]["comments"][number];

/** One thing waiting on me: work assigned to me by name, or a note that @mentions me that I have not read. */
export type OnYou =
  | { type: "work"; key: string; since: number; q: QueueItem }
  | { type: "mention"; key: string; since: number; c: Note };

/**
 * The one list of what is on me. The sidebar queue, the phone's Inbox, the dashboard's
 * "Waiting on you" and the inbox's "On you" all read it, so they never
 * disagree. Whatever has waited longest comes first.
 */
export function onYou(ws: WS, unread: readonly string[] = ws.d.unreadMentions): OnYou[] {
  const ids = new Set(unread);
  const work: OnYou[] = ws.queue().filter((q) => q.who === ws.me.id).map((q) => ({ type: "work", key: q.kind + q.id, since: +q.since, q }));
  const mentions: OnYou[] = ws.d.comments.filter((c) => ids.has(c.id)).map((c) => ({ type: "mention", key: "m" + c.id, since: +new Date(c.createdAt), c }));
  return [...work, ...mentions].sort((a, b) => a.since - b.since);
}

export function useOnYou(): OnYou[] {
  const { ws } = useApp();
  return useMemo(() => onYou(ws), [ws]);
}

/** The offer or asset a note sits on. */
export function noteWhere(ws: WS, c: Note): string {
  return (c.kind === "asset" ? ws.asset(c.itemId)?.name : ws.offer(c.itemId)?.name) ?? "a note";
}

export function Inbox() {
  const { inbox, setInbox } = useApp();
  if (!inbox) return null;
  return <Panel onClose={() => setInbox(false)} />;
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="m-0 mb-2.5 flex items-center gap-2 text-small font-semibold text-mute-2">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-md bg-soft text-accent [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        {title}
        {count !== undefined && <span className="rounded-full bg-chip px-1.5 py-px text-micro font-semibold tabular-nums text-mute-2">{count}</span>}
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
  // Mentions that were new when the panel opened stay under "On you" while it is open, even once they count as read.
  const [fresh] = useState(() => ws.d.unreadMentions);
  const mine = useMemo(() => onYou(ws, fresh), [ws, fresh]);
  const others = useMemo(() => ws.queue().filter((x) => x.who !== meId), [ws, meId]);
  const unread = useMemo(() => new Set(ws.d.unreadMentions), [ws]);
  const earlier = useMemo(() => {
    const shown = new Set(fresh);
    return ws.d.comments.filter((c) => c.mentions.includes(meId) && c.userId !== meId && !c.resolved && !shown.has(c.id)).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20);
  }, [ws, meId, fresh]);

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

  const nothing = !mine.length && !earlier.length && !others.length;

  const mention = (m: Note) => {
    const isNew = unread.has(m.id) || fresh.includes(m.id);
    return (
      <button key={m.id} type="button" onClick={() => openItem(m.kind, m.itemId)} className={cx("lift flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left", isNew ? "border-accent/40 bg-soft" : "border-line bg-surface")}>
        <Avatar initials={ws.user(m.userId).initials} size={26} mono />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 text-body leading-[1.5] text-ink-3">{m.text}</span>
          <span className="mt-1 block text-small text-mute-3">{ws.first(m.userId)} · on {noteWhere(ws, m)} · {ws.ago(m.createdAt)}</span>
        </span>
        {isNew && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-change" role="img" aria-label="New" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Inbox">
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.28)]" onClick={onClose} />
      <div data-scroll className="absolute inset-y-0 right-0 flex w-[440px] max-w-full animate-slide flex-col overflow-y-auto border-l border-line bg-wash shadow-pop">
        <div className="safe-top sticky top-0 z-[2] border-b border-line bg-surface">
          <div className="flex items-center gap-3 px-5 py-4">
            <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-lg bg-soft text-accent"><InboxIcon className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-lead font-semibold leading-tight tracking-[-0.012em]">Inbox</span>
              <span className="block text-meta text-mute-2">
                {mine.length ? `${mine.length} ${mine.length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
              </span>
            </span>
            <IconBtn ref={closeRef} label="Close" onClick={onClose}><X aria-hidden /></IconBtn>
          </div>
        </div>

        <div className="flex-1 px-5 pb-8 pt-5">
          {nothing ? (
            <div className="px-4 py-12 text-center">
              <div className="text-lead font-semibold">You are all caught up</div>
              <p className="mx-auto mb-0 mt-1 max-w-[34ch] text-body text-mute-2 text-pretty">Work sent to you for review or changes, and notes that @mention you, show up here.</p>
            </div>
          ) : (
            <>
              <Section icon={<UserRound />} title="On you" count={mine.length}>
                <div className="flex flex-col gap-2">
                  {mine.map((x) => {
                    if (x.type === "mention") return mention(x.c);
                    const q = x.q;
                    return (
                      <button key={x.key} type="button" onClick={() => openItem(q.kind, q.id)} className="lift w-full rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card">
                        <span className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className={cx(PILL, q.act === "review" ? "bg-warn/12 text-warn-ink" : "bg-change/10 text-change-ink")}>{q.verb}</span>
                          <span className="flex-1" /><span className="text-small text-mute-3">{q.act === "review" ? `In review ${q.ago.replace(/ ago$/, "")}` : `Sent back ${q.ago}`}</span>
                        </span>
                        <span className="block text-body font-semibold leading-[1.35]">{q.name}</span>
                        <span className="mt-0.5 block text-body text-mute-2">{q.sub}</span>
                        {q.note && <span className="mt-2 block border-t border-divider pt-2 text-meta leading-[1.5] text-change-ink">{q.note}</span>}
                      </button>
                    );
                  })}
                  {!mine.length && <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-4 py-5 text-center text-body text-mute-2">Nothing has your name on it.</div>}
                </div>
              </Section>

              {earlier.length > 0 && (
                <Section icon={<AtSign />} title="Earlier mentions" count={earlier.length}>
                  <div className="flex flex-col gap-2">{earlier.map(mention)}</div>
                </Section>
              )}

              <Section icon={<Users />} title={others.length ? "With other people" : "Nothing with anyone else"} count={others.length || undefined}>
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {others.map((x) => (
                    <button key={x.kind + x.id} type="button" onClick={() => openItem(x.kind, x.id)} className="group flex w-full items-center gap-3 border-t border-divider px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-wash">
                      <Avatar initials={ws.user(x.who).initials} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium">{x.name}</span>
                        <span className="block text-small text-mute-3">{x.verb} · {ws.first(x.who)}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 flex-none text-mute-3 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </button>
                  ))}
                  {!others.length && <div className="px-4 py-3 text-body text-mute-3">Nobody else is holding anything up.</div>}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
