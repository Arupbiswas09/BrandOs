"use client";

import { ACCESS_COLOR } from "@/lib/constants";
import { hexA, readable } from "@/lib/color";
import { switchUser } from "@/app/actions";
import { createInvite } from "@/app/auth-actions";
import { useAction, useApp } from "@/components/app/provider";
import { Avatar, Btn, Card, H2, Page, PageHead, Tabs } from "@/components/ui";
import { useStored } from "@/lib/stored";
import { AccessMap, RoleMatrix } from "./access";

const TEAM_TABS = [["people", "People"], ["roles", "Roles and permissions"], ["map", "Who sees what"], ["groups", "Groups"]] as const;
type TeamTab = (typeof TEAM_TABS)[number][0];
const TEAM_KEYS = TEAM_TABS.map((t) => t[0]);

export function Team() {
  const { ws, open, toast } = useApp();
  const [run] = useAction();
  const canAccess = ws.can("access");
  const demo = ws.d.authMode === "demo";
  const [tab, setTab] = useStored<TeamTab>("bos:team-tab", "people", TEAM_KEYS);
  const invite = async (id: string) => {
    const r = await createInvite(id);
    if (!r.ok) return toast(r.error, "error");
    const url = window.location.origin + r.path;
    if (r.emailed) { toast("Emailed. The link works once, for a week."); return; }
    try { await navigator.clipboard.writeText(url); toast("Link copied — send it to them. It works once, for a week."); }
    catch { window.prompt("Copy this invite link", url); }
  };
  return (
    <Page>
      <PageHead
        eyebrow="People and permissions"
        title="Team and access"
        actions={canAccess && <Btn variant="primary" size="lg" onClick={() => open({ kind: "person" })}>+ Invite someone</Btn>}
        sub={<>Two things decide what a person gets: their <b className="font-semibold text-ink">role</b> says what they can do, and their <b className="font-semibold text-ink">scope</b> says which clients they can see. The server checks both on every change.</>}
      />

      <Tabs className="-mt-3 mb-6 border-b border-line" items={TEAM_TABS.map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => setTab(k) }))} />

      {tab === "roles" && <RoleMatrix />}
      {tab === "map" && <AccessMap />}
      {tab === "people" && <>
      <Card className="mb-9 overflow-hidden">
        {ws.d.users.map((u) => {
          const isMe = u.id === ws.me.id;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-divider px-5 py-3.5 first:border-t-0">
              <Avatar initials={u.initials} size={34} mono className="text-[13.5px] font-bold" />
              <span className="w-[154px] min-w-0 flex-none">
                <span className="flex items-center gap-[7px]"><span className="truncate text-[15px] font-semibold">{u.name}</span>{isMe && <span className="font-mono text-[12.5px] text-mute-4">You</span>}</span>
                <span className="mt-px block truncate text-[14.5px] text-mute-3">{u.role}</span>
              </span>
              <AccessChip access={u.access} />
              <span className="min-w-[96px] flex-1 text-[15px] leading-[1.35] text-mute-1">{ws.scopeLabel(u)}</span>
              <span className="flex-none font-mono text-[14.5px] text-mute-3" title="Items waiting on them">{ws.d.queueCounts[u.id] ?? 0}</span>
              {demo && !isMe && <Btn size="sm" onClick={() => run(switchUser, u.id)}>View as</Btn>}
              {!demo && canAccess && !isMe && (
                <button type="button" onClick={() => invite(u.id)} className="flex-none p-[5px] text-[14px] text-accent hover:underline">{u.hasPassword ? "Reset link" : "Invite link"}</button>
              )}
              {!demo && !u.hasPassword && <span className="flex-none rounded bg-chip px-1.5 py-0.5 text-[13px] text-mute-3">Not joined</span>}
              {canAccess && <button type="button" onClick={() => open({ kind: "person", draft: u })} className="flex-none p-[5px] text-[14px] text-mute-3 hover:text-ink">Access</button>}
              {canAccess && !isMe && <button type="button" onClick={() => open({ kind: "confirm", item: "person", id: u.id, label: u.name })} className="flex-none p-[5px] text-[14px] text-mute-5 hover:text-danger">Remove</button>}
            </div>
          );
        })}
      </Card>

      </>}

      {tab === "groups" && <>
      <H2 className="mb-[5px]" right={canAccess && <button type="button" onClick={() => open({ kind: "group" })} className="text-[14.5px] text-mute-2 hover:text-ink">+ New group</button>}>Groups</H2>
      <p className="mb-[13px] mt-0 max-w-[62ch] text-[15px] text-mute-3">A group is a saved set of clients. Put someone in the pod and they get everything the pod covers — no per-person list to maintain.</p>
      <div className="grid gap-3.5 md:grid-cols-2">
        {ws.d.groups.map((g) => {
          const members = ws.d.users.filter((u) => u.groupIds.includes(g.id));
          return (
            <Card key={g.id} className="rounded-[13px] px-5 py-[18px]">
              <div className="mb-[5px] flex items-baseline gap-[9px]">
                <span className="text-[16px] font-semibold">{g.name}</span>
                <span className="flex-1" />
                <span className="font-mono text-[14.5px] text-mute-3">{members.length} {members.length === 1 ? "person" : "people"}</span>
              </div>
              <div className="mb-3 text-[15px] leading-[1.5] text-mute-1">{g.note}</div>
              <div className="mb-3 flex flex-wrap gap-[5px]">
                {g.clientIds.map((c) => ws.client(c)).filter(Boolean).map((c) => <span key={c!.id} className="rounded-[5px] bg-chip px-[9px] py-[3px] text-[14px] text-mute-1">{c!.name}</span>)}
              </div>
              <div className="flex items-center gap-[5px] border-t border-divider pt-[11px]">
                {members.map((m) => <Avatar key={m.id} initials={m.initials} size={26} mono title={m.name} className="text-[12px] font-bold" />)}
                {!members.length && <span className="text-[14.5px] text-mute-4">Nobody in it yet</span>}
                <span className="flex-1" />
                {canAccess && (
                  <>
                    <button type="button" onClick={() => open({ kind: "group", draft: g })} className="text-[14px] text-mute-3 hover:text-ink">Edit</button>
                    <button type="button" onClick={() => open({ kind: "confirm", item: "group", id: g.id, label: g.name })} className="ml-2 text-[14px] text-mute-5 hover:text-danger">Delete</button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      </>}
    </Page>
  );
}

export function AccessChip({ access }: { access: keyof typeof ACCESS_COLOR }) {
  const c = ACCESS_COLOR[access];
  return <span className="flex-none rounded-[5px] px-[9px] py-[3px] font-mono text-[13.5px] font-bold tracking-[0.04em]" style={{ background: hexA(c, 0.14), color: readable(c) }}>{access}</span>;
}
