"use client";

import { ACCESS_COLOR, ACCESS_LEVELS, ACCESS_NOTE } from "@/lib/constants";
import { hexA, readable } from "@/lib/color";
import { switchUser } from "@/app/actions";
import { createInvite } from "@/app/auth-actions";
import { useAction, useApp } from "@/components/app/provider";
import { Avatar, Btn, Card, H2, Page, PageHead } from "@/components/ui";

export function Team() {
  const { ws, open, toast } = useApp();
  const [run] = useAction();
  const canAccess = ws.can("access");
  const demo = ws.d.authMode === "demo";
  const invite = async (id: string) => {
    const r = await createInvite(id);
    if (!r.ok) return toast(r.error, "error");
    const url = window.location.origin + r.path;
    try { await navigator.clipboard.writeText(url); toast("Invite link copied. It works once, for a week."); }
    catch { window.prompt("Copy this invite link", url); }
  };
  return (
    <Page>
      <PageHead
        eyebrow="Who is in the building"
        title="Team"
        actions={canAccess && <Btn variant="primary" size="lg" onClick={() => open({ kind: "person" })}>+ Invite someone</Btn>}
      />
      <p className="mb-[30px] max-w-[62ch] text-[14.5px] text-[#566560] text-pretty">Two things decide what a person gets: what they are allowed to do, and which clients they can see. Everything else follows from those.</p>

      <div className="mb-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACCESS_LEVELS.map((a) => (
          <Card key={a} className="rounded-xl px-[17px] py-[15px]">
            <div className="mb-2 flex items-center gap-2">
              <AccessChip access={a} />
              <span className="flex-1" />
              <span className="font-mono text-[13px] text-mute-3">{ws.d.users.filter((u) => u.access === a).length}</span>
            </div>
            <div className="text-[13px] leading-[1.5] text-mute-1 text-pretty">{ACCESS_NOTE[a]}</div>
          </Card>
        ))}
      </div>

      <H2>People</H2>
      <Card className="mb-9 overflow-hidden">
        {ws.d.users.map((u) => {
          const isMe = u.id === ws.me.id;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-divider px-5 py-3.5 first:border-t-0">
              <Avatar initials={u.initials} size={34} mono className="text-[12px] font-bold" />
              <span className="w-[154px] min-w-0 flex-none">
                <span className="flex items-center gap-[7px]"><span className="truncate text-[14px] font-semibold">{u.name}</span>{isMe && <span className="font-mono text-[11px] text-mute-4">You</span>}</span>
                <span className="mt-px block truncate text-[13px] text-mute-3">{u.role}</span>
              </span>
              <AccessChip access={u.access} />
              <span className="min-w-[96px] flex-1 text-[13.5px] leading-[1.35] text-mute-1">{ws.scopeLabel(u)}</span>
              <span className="flex-none font-mono text-[13px] text-mute-3" title="Items waiting on them">{ws.d.queueCounts[u.id] ?? 0}</span>
              {demo && !isMe && <Btn size="sm" onClick={() => run(switchUser, u.id)}>View as</Btn>}
              {!demo && canAccess && !isMe && (
                <button type="button" onClick={() => invite(u.id)} className="flex-none p-[5px] text-[12.5px] text-accent hover:underline">{u.hasPassword ? "Reset link" : "Invite link"}</button>
              )}
              {!demo && !u.hasPassword && <span className="flex-none rounded bg-chip px-1.5 py-0.5 text-[11.5px] text-mute-3">Not joined</span>}
              {canAccess && <button type="button" onClick={() => open({ kind: "person", draft: u })} className="flex-none p-[5px] text-[12.5px] text-mute-3 hover:text-ink">Access</button>}
              {canAccess && !isMe && <button type="button" onClick={() => open({ kind: "confirm", item: "person", id: u.id, label: u.name })} className="flex-none p-[5px] text-[12.5px] text-mute-5 hover:text-danger">Remove</button>}
            </div>
          );
        })}
      </Card>

      <H2 className="mb-[5px]" right={canAccess && <button type="button" onClick={() => open({ kind: "group" })} className="text-[13px] text-mute-2 hover:text-ink">+ New group</button>}>Groups</H2>
      <p className="mb-[13px] mt-0 max-w-[62ch] text-[13.5px] text-mute-3">A group is a saved set of clients. Put someone in the pod and they get everything the pod covers — no per-person list to maintain.</p>
      <div className="grid gap-3.5 md:grid-cols-2">
        {ws.d.groups.map((g) => {
          const members = ws.d.users.filter((u) => u.groupIds.includes(g.id));
          return (
            <Card key={g.id} className="rounded-[13px] px-5 py-[18px]">
              <div className="mb-[5px] flex items-baseline gap-[9px]">
                <span className="text-[15px] font-semibold">{g.name}</span>
                <span className="flex-1" />
                <span className="font-mono text-[13px] text-mute-3">{members.length} {members.length === 1 ? "person" : "people"}</span>
              </div>
              <div className="mb-3 text-[13.5px] leading-[1.5] text-mute-1">{g.note}</div>
              <div className="mb-3 flex flex-wrap gap-[5px]">
                {g.clientIds.map((c) => ws.client(c)).filter(Boolean).map((c) => <span key={c!.id} className="rounded-[5px] bg-chip px-[9px] py-[3px] text-[12.5px] text-mute-1">{c!.name}</span>)}
              </div>
              <div className="flex items-center gap-[5px] border-t border-divider pt-[11px]">
                {members.map((m) => <Avatar key={m.id} initials={m.initials} size={26} mono title={m.name} className="text-[10.5px] font-bold" />)}
                {!members.length && <span className="text-[13px] text-mute-4">Nobody in it yet</span>}
                <span className="flex-1" />
                {canAccess && (
                  <>
                    <button type="button" onClick={() => open({ kind: "group", draft: g })} className="text-[12.5px] text-mute-3 hover:text-ink">Edit</button>
                    <button type="button" onClick={() => open({ kind: "confirm", item: "group", id: g.id, label: g.name })} className="ml-2 text-[12.5px] text-mute-5 hover:text-danger">Delete</button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

function AccessChip({ access }: { access: keyof typeof ACCESS_COLOR }) {
  const c = ACCESS_COLOR[access];
  return <span className="flex-none rounded-[5px] px-[9px] py-[3px] font-mono text-[12px] font-bold tracking-[0.04em]" style={{ background: hexA(c, 0.14), color: readable(c) }}>{access}</span>;
}
