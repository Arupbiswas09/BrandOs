"use client";

import { Plus, UserPlus, UsersRound } from "lucide-react";
import { ACCESS_COLOR } from "@/lib/constants";
import { PERM_INFO } from "@/lib/access";
import { hexA, readable } from "@/lib/color";
import { switchUser } from "@/app/actions";
import { createInvite } from "@/app/auth-actions";
import { resetTeammateTwoFactor, signOutTeammateEverywhere } from "@/app/security-actions";
import { useAction, useApp } from "@/components/app/provider";
import { Avatar, Btn, Card, Empty, H2, Page, PageHead, Tabs } from "@/components/ui";
import { useStored } from "@/lib/stored";
import { AccessMap, RoleMatrix } from "./access";
import { UploadLimits } from "./limits";

const TEAM_TABS = [["people", "People"], ["roles", "Roles and permissions"], ["map", "Who sees what"], ["groups", "Groups"], ["limits", "Upload limits"]] as const;
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
  const security = async (kind: "2fa" | "sessions", id: string, name: string) => {
    const ask = kind === "2fa"
      ? `Reset two-step verification for ${name}? They can sign in with just their password until they set it up again.`
      : `Sign ${name} out on every device? They will need to sign in again.`;
    if (!window.confirm(ask)) return;
    const r = await run(kind === "2fa" ? resetTeammateTwoFactor : signOutTeammateEverywhere, id);
    if (r.ok) toast(kind === "2fa" ? `Two-step verification reset for ${name}.` : `${name} is signed out everywhere.`);
  };
  return (
    <Page>
      <PageHead
        eyebrow="People and permissions"
        title="Team and access"
        actions={canAccess && <Btn variant="primary" size="lg" onClick={() => open({ kind: "person" })}><UserPlus aria-hidden className="h-4 w-4" />Invite someone</Btn>}
        sub={<>Two things decide what a person gets: their <b className="font-semibold text-ink">role</b> says what they can do, and their <b className="font-semibold text-ink">scope</b> says which clients they can see. The server checks both on every change.</>}
        tabs={<Tabs items={TEAM_TABS.filter(([k]) => k !== "limits" || canAccess).map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => setTab(k) }))} />}
      />

      {tab === "roles" && <RoleMatrix />}
      {tab === "map" && <AccessMap />}
      {tab === "limits" && <UploadLimits />}
      {tab === "people" && <>
      <Card className="overflow-hidden">
        {ws.d.users.map((u) => {
          const isMe = u.id === ws.me.id;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-divider px-5 py-3 transition-colors first:border-t-0 hover:bg-wash">
              <Avatar initials={u.initials} size={34} mono className="text-meta font-bold" />
              <span className="w-[154px] min-w-0 flex-none">
                <span className="flex items-center gap-2"><span className="truncate text-body font-semibold">{u.name}</span>{isMe && <span className="font-mono text-small text-mute-4">You</span>}</span>
                <span className="mt-px block truncate text-body text-mute-3">{u.role}</span>
              </span>
              <AccessChip access={u.access} />
              {Object.keys(u.permOverrides ?? {}).length > 0 && (
                <span className="flex-none rounded-sm bg-[#FEF3C7] px-2 py-1 text-small font-semibold text-[#92400E]" title={Object.entries(u.permOverrides).map(([p, v]) => `${v ? "Allowed" : "Blocked"}: ${PERM_INFO.find((x) => x.perm === p)?.label ?? p}`).join("\n")}>
                  Custom · {Object.keys(u.permOverrides).length}
                </span>
              )}
              <span className="min-w-[96px] flex-1 text-body leading-[1.35] text-mute-1">{ws.scopeLabel(u)}</span>
              <span className="flex-none font-mono text-body text-mute-3" title="Items waiting on them">{ws.d.queueCounts[u.id] ?? 0}</span>
              {demo && !isMe && <Btn size="sm" onClick={() => run(switchUser, u.id)}>View as</Btn>}
              {!demo && canAccess && !isMe && (
                <button type="button" onClick={() => invite(u.id)} className="flex-none p-1 text-meta text-accent hover:underline">{u.hasPassword ? "Reset link" : "Invite link"}</button>
              )}
              {!demo && !u.hasPassword && <span className="flex-none rounded bg-chip px-1.5 py-0.5 text-small text-mute-3">Not joined</span>}
              {!demo && u.twoFactor && <span className="flex-none rounded bg-[#DCFCE7] px-1.5 py-0.5 text-small font-medium text-[#166534]" title="Two-step verification is on">2-step on</span>}
              {!demo && canAccess && !isMe && u.twoFactor && (
                <button type="button" onClick={() => security("2fa", u.id, u.name)} className="flex-none p-1 text-meta text-mute-3 hover:text-ink">Reset 2-step</button>
              )}
              {!demo && canAccess && !isMe && (
                <button type="button" onClick={() => security("sessions", u.id, u.name)} className="flex-none p-1 text-meta text-mute-3 hover:text-ink" title="End every session they have">Sign out everywhere</button>
              )}
              {canAccess && <button type="button" aria-label={`Access for ${u.name}`} onClick={() => open({ kind: "person", draft: u })} className="flex-none p-1 text-meta text-mute-3 hover:text-ink">Access</button>}
              {canAccess && !isMe && <button type="button" onClick={() => open({ kind: "confirm", item: "person", id: u.id, label: u.name })} className="flex-none p-1 text-meta text-mute-5 hover:text-danger">Remove</button>}
            </div>
          );
        })}
      </Card>

      </>}

      {tab === "groups" && <>
      <H2 className="mb-1" icon={<UsersRound />} right={canAccess && <Btn size="sm" onClick={() => open({ kind: "group" })}><Plus aria-hidden className="h-3.5 w-3.5" />New group</Btn>}>Groups</H2>
      <p className="mb-4 mt-0 max-w-[62ch] text-body text-mute-3">A group is a saved set of clients. Put someone in the pod and they get everything the pod covers — no per-person list to maintain.</p>
      <div className="grid gap-3.5 md:grid-cols-2">
        {ws.d.groups.map((g) => {
          const members = ws.d.users.filter((u) => u.groupIds.includes(g.id));
          return (
            <Card key={g.id} className="rounded-xl px-5 py-4">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-lead font-semibold">{g.name}</span>
                <span className="flex-1" />
                <span className="font-mono text-body text-mute-3">{members.length} {members.length === 1 ? "person" : "people"}</span>
              </div>
              <div className="mb-3 text-body leading-[1.5] text-mute-1">{g.note}</div>
              <div className="mb-3 flex flex-wrap gap-1">
                {g.clientIds.map((c) => ws.client(c)).filter(Boolean).map((c) => <span key={c!.id} className="rounded-sm bg-chip px-2 py-1 text-meta text-mute-1">{c!.name}</span>)}
              </div>
              <div className="flex items-center gap-1 border-t border-divider pt-3">
                {members.map((m) => <Avatar key={m.id} initials={m.initials} size={26} mono title={m.name} className="text-micro font-bold" />)}
                {!members.length && <span className="text-body text-mute-4">Nobody in it yet</span>}
                <span className="flex-1" />
                {canAccess && (
                  <>
                    <button type="button" onClick={() => open({ kind: "group", draft: g })} className="text-meta text-mute-3 hover:text-ink">Edit</button>
                    <button type="button" onClick={() => open({ kind: "confirm", item: "group", id: g.id, label: g.name })} className="ml-2 text-meta text-mute-5 hover:text-danger">Delete</button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!ws.d.groups.length && (
        <Empty title="No groups yet" body="Make a group for a pod or an account team, and everyone in it gets every client the group covers.">
          {canAccess && <Btn variant="primary" onClick={() => open({ kind: "group" })}>Make a group</Btn>}
        </Empty>
      )}
      </>}
    </Page>
  );
}

export function AccessChip({ access }: { access: keyof typeof ACCESS_COLOR }) {
  const c = ACCESS_COLOR[access];
  return <span className="flex-none rounded-sm px-2 py-1 font-mono text-meta font-bold tracking-[0.04em]" style={{ background: hexA(c, 0.14), color: readable(c) }}>{access}</span>;
}
