"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { markMentionsRead } from "@/app/actions";
import { useApp } from "./provider";
import { Avatar, DueBadge, Eyebrow, cx } from "@/components/ui";

export function Inbox() {
  const { inbox, setInbox } = useApp();
  if (!inbox) return null;
  return <Panel onClose={() => setInbox(false)} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  const { ws, openAsset } = useApp();
  const router = useRouter();
  const meId = ws.me.id;
  const q = useMemo(() => ws.queue(), [ws]);
  const mine = q.filter((x) => x.who === meId);
  const others = q.filter((x) => x.who !== meId);
  const unread = useMemo(() => new Set(ws.d.unreadMentions), [ws]);
  const mentions = useMemo(
    () => ws.d.comments.filter((c) => c.mentions.includes(meId) && c.userId !== meId && !c.resolved).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20),
    [ws, meId],
  );

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

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Inbox">
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.24)]" onClick={onClose} />
      <div data-scroll className="absolute inset-y-0 right-0 w-[440px] max-w-full animate-slide overflow-y-auto border-l border-line bg-white shadow-[-16px_0_44px_rgba(16,22,20,.10)]">
        <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-line bg-white/95 px-[22px] py-[18px] backdrop-blur-[8px]">
          <span className="flex-1 text-[17px] font-semibold tracking-[-0.012em]">
            {mine.length ? `${mine.length} ${mine.length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="px-1.5 py-0.5 text-[16px] text-mute-2 hover:text-ink">✕</button>
        </div>
        <div className="px-[22px] pb-8 pt-[18px]">
          <Eyebrow className="mb-2.5">On you</Eyebrow>
          <div className="mb-7 flex flex-col gap-2">
            {mine.map((x) => {
              const c = x.act === "review" ? "#8A6A12" : "#C2410C";
              return (
                <button key={x.kind + x.id} type="button" onClick={() => openItem(x.kind, x.id)} className="w-full rounded-xl border border-line bg-white px-4 py-3.5 text-left hover:border-mute-2">
                  <span className="mb-1.5 flex items-center gap-2">
                    <span className="rounded-[5px] px-2 py-0.5 text-[12.5px] font-semibold" style={{ background: hexA(c, 0.15), color: readable(c, 0.15) }}>{x.verb}</span>
                    <DueBadge at={x.dueAt} now={ws.d.now} />
                    <span className="flex-1" /><span className="text-[13.5px] text-[#526077]">{x.ago}</span>
                  </span>
                  <span className="block text-[16px] font-semibold leading-[1.35]">{x.name}</span>
                  <span className="mt-0.5 block text-[15px] text-mute-2">{x.sub}</span>
                  {x.note && <span className="mt-2 block border-t border-divider pt-2 text-[14.5px] leading-[1.5] text-change-ink">{x.note}</span>}
                </button>
              );
            })}
            {!mine.length && <div className="rounded-xl border border-dashed border-line-strong p-[30px] text-center text-[15px] text-mute-2">Nothing has your name on it.</div>}
          </div>

          {mentions.length > 0 && (
            <>
              <Eyebrow className="mb-2.5">Mentions</Eyebrow>
              <div className="mb-7 flex flex-col gap-2">
                {mentions.map((m) => {
                  const where = m.kind === "asset" ? ws.asset(m.itemId)?.name : ws.offer(m.itemId)?.name;
                  const isNew = unread.has(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => openItem(m.kind, m.itemId)} className={cx("flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left hover:border-mute-2", isNew ? "border-accent/40 bg-soft" : "border-line bg-white")}>
                      <Avatar initials={ws.user(m.userId).initials} size={24} mono />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-3 block text-[15px] leading-[1.5] text-ink-3">{m.text}</span>
                        <span className="mt-1 block text-[13.5px] text-mute-4">{ws.first(m.userId)} · on {where} · {ws.ago(m.createdAt)}</span>
                      </span>
                      {isNew && <span className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full bg-change" aria-label="New" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <Eyebrow className="mb-2.5">{others.length ? `${others.length} with other people` : "Nothing with anyone else"}</Eyebrow>
          <div className="flex flex-col gap-[7px]">
            {others.map((x) => (
              <button key={x.kind + x.id} type="button" onClick={() => openItem(x.kind, x.id)} className="flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-left hover:bg-hover">
                <Avatar initials={ws.user(x.who).initials} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{x.name}</span>
                  <span className="block text-[13.5px] text-mute-4">{x.verb} · {ws.first(x.who)}</span>
                </span>
              </button>
            ))}
            {!others.length && <div className="px-0.5 py-2 text-[15px] text-mute-4">Nobody else is holding anything up.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
