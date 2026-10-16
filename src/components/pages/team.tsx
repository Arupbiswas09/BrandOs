"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";
import { PERM_INFO } from "@/lib/access";
import { plural } from "@/lib/ws";
import type { PublicUser } from "@/lib/types";
import { switchUser } from "@/app/actions";
import { createInvite } from "@/app/auth-actions";
import { resetTeammateTwoFactor, signOutTeammateEverywhere } from "@/app/security-actions";
import { useAction, useApp } from "@/components/app/provider";
import { CardMenu, type CardMenuItem } from "@/components/card-menu";
import { Avatar, Btn, Card, Empty, Page, PageHead, cx } from "@/components/ui";
import { useStored } from "@/lib/stored";
import { AccessMap, RoleChip, RoleMatrix } from "./access";

// Upload limits live in Settings (one editor, one place); People links there.
const TEAM_TABS = [["people", "People"], ["roles", "Roles and permissions"], ["map", "Who sees what"], ["groups", "Groups"]] as const;
type TeamTab = (typeof TEAM_TABS)[number][0];
const TEAM_KEYS = TEAM_TABS.map((t) => t[0]);

/** Name · role · what they see · waiting · actions. The header row and every person share it. */
const COLS = "md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_64px_184px] md:items-center md:gap-4";

/** Whether the row has room for its own buttons (from 640px); below that, everything sits in the "…" menu. */
function useWide() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(min-width: 640px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => true,
  );
}

export function Team() {
  const { ws, open } = useApp();
  const canAccess = ws.can("access");
  const [tab, setTab] = useStored<TeamTab>("bos:team-tab", "people", TEAM_KEYS);
  return (
    <Page>
      <PageHead
        eyebrow="People and permissions"
        title="Team and access"
        actions={canAccess && <Btn variant="primary" onClick={() => open({ kind: "person" })}><UserPlus aria-hidden className="size-4" />Invite someone</Btn>}
        sub={<>A <b className="font-semibold text-ink">role</b> says what someone can do; their <b className="font-semibold text-ink">scope</b> says which clients they can see. The server checks both on every change.</>}
        tabs={<TeamTabs active={tab} onChange={setTab} />}
      />

      <div role="tabpanel" id="team-panel" aria-labelledby={`team-tab-${tab}`}>
        {tab === "people" && <People />}
        {tab === "roles" && <RoleMatrix />}
        {tab === "map" && <AccessMap />}
        {tab === "groups" && <Groups />}
      </div>
    </Page>
  );
}

/** Underline tabs under the header: one tab stop, arrow keys move between them. */
function TeamTabs({ active, onChange }: { active: TeamTab; onChange: (k: TeamTab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = TEAM_TABS.length;
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = TEAM_TABS[(to + n) % n][0];
    refs.current[next]?.focus();
    onChange(next);
  };
  return (
    <div role="tablist" aria-label="Team" data-scroll className="mt-5 flex flex-none gap-1 overflow-x-auto">
      {TEAM_TABS.map(([k, label], i) => {
        const on = k === active;
        return (
          <button key={k} ref={(el) => { refs.current[k] = el; }} type="button" role="tab" id={`team-tab-${k}`} aria-selected={on} aria-controls="team-panel" tabIndex={on ? 0 : -1}
            onClick={() => onChange(k)} onKeyDown={(e) => onKey(e, i)}
            className={cx("focus-inset -mb-px flex-none whitespace-nowrap rounded-t-lg border-b-2 px-3 pb-3 pt-1.5 text-body font-medium transition-colors duration-150", on ? "border-accent text-ink" : "border-transparent text-mute-3 hover:border-line-strong hover:text-ink")}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function People() {
  const { ws } = useApp();
  return (
    <>
    <Card className="overflow-hidden">
      <div aria-hidden className={cx("hidden border-b border-line bg-wash-2 px-4 py-2 text-small font-semibold text-mute-2", COLS)}>
        <span>Name</span><span>Role</span><span>Sees</span><span className="text-right">Waiting</span><span />
      </div>
      <ul className="m-0 list-none p-0">
        {ws.d.users.map((u) => <PersonRow key={u.id} u={u} />)}
      </ul>
    </Card>
    {ws.can("access") && (
      <p className="m-0 mt-3 text-meta text-mute-2">
        <Link href="/settings?section=uploads" className="font-medium text-accent hover:underline">Upload limits are in Settings</Link>
      </p>
    )}
    </>
  );
}

function PersonRow({ u }: { u: PublicUser }) {
  const { ws, open, toast } = useApp();
  const [run] = useAction();
  const wide = useWide();
  const canAccess = ws.can("access");
  const demo = ws.d.authMode === "demo";
  const isMe = u.id === ws.me.id;
  // The old Client role: kept in the data, shown as "No access", never signed in as.
  const noAccess = u.access === "Client";
  const waiting = ws.d.queueCounts[u.id] ?? 0;
  const exceptions = Object.keys(u.permOverrides ?? {});

  const invite = async () => {
    const r = await createInvite(u.id);
    if (!r.ok) return toast(r.error, "error");
    const url = window.location.origin + r.path;
    if (r.emailed) { toast("Emailed. The link works once, for a week."); return; }
    try { await navigator.clipboard.writeText(url); toast("Link copied. Send it to them; it works once, for a week."); }
    catch { window.prompt("Copy this invite link", url); }
  };
  const security = async (kind: "2fa" | "sessions") => {
    const ask = kind === "2fa"
      ? `Reset two-step verification for ${u.name}? They can sign in with just their password until they set it up again.`
      : `Sign ${u.name} out on every device? They will need to sign in again.`;
    if (!window.confirm(ask)) return;
    const r = await run(kind === "2fa" ? resetTeammateTwoFactor : signOutTeammateEverywhere, u.id);
    if (r.ok) toast(kind === "2fa" ? `Two-step verification reset for ${u.name}.` : `${u.name} is signed out everywhere.`);
  };

  const canViewAs = demo && !isMe && !noAccess;
  const editAccess = () => open({ kind: "person", draft: u });
  const items: CardMenuItem[] = [
    // On phones the row has no room for its buttons, so they come first in the menu.
    ...(!wide && canViewAs ? [{ kind: "item" as const, label: "View as", onSelect: () => void run(switchUser, u.id) }] : []),
    ...(!wide && canAccess ? [{ kind: "item" as const, label: "Edit access", onSelect: editAccess }] : []),
    ...(!demo && canAccess && !isMe && !noAccess ? [{ kind: "item" as const, label: u.hasPassword ? "Copy a password reset link" : "Copy an invite link", onSelect: () => void invite() }] : []),
    ...(!demo && canAccess && !isMe && u.twoFactor ? [{ kind: "item" as const, label: "Reset two-step verification", onSelect: () => void security("2fa") }] : []),
    ...(!demo && canAccess && !isMe ? [{ kind: "item" as const, label: "Sign out everywhere", onSelect: () => void security("sessions") }] : []),
    ...(canAccess && !isMe ? [{ kind: "item" as const, label: "Remove from the team", danger: true, onSelect: () => open({ kind: "confirm", item: "person", id: u.id, label: u.name }) }] : []),
  ];

  return (
    <li className={cx("flex items-center gap-3 border-t border-divider px-4 py-2.5 first:border-t-0 md:py-2", COLS)}>
      {/* Name and what they do; on phones their role, scope and queue sit underneath. */}
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar initials={u.initials} size={32} />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-body font-semibold">{u.name}</span>
            {isMe && <span className="flex-none text-small text-mute-3">You</span>}
          </span>
          <span className="block truncate text-small text-mute-3">{u.role}</span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-small text-mute-2 md:hidden">
            <RoleChip role={u.access} />
            <span className="min-w-0 truncate">{ws.scopeLabel(u)}{waiting > 0 && ` · ${waiting} waiting`}</span>
          </span>
        </span>
      </span>
      <span className="hidden min-w-0 flex-wrap items-center gap-1.5 md:flex">
        <RoleChip role={u.access} />
        {exceptions.length > 0 && (
          <span className="flex-none rounded-sm bg-warn/12 px-2 py-0.5 text-small font-semibold text-warn-ink" title={Object.entries(u.permOverrides).map(([p, v]) => `${v ? "Allowed" : "Blocked"}: ${PERM_INFO.find((x) => x.perm === p)?.label ?? p}`).join("\n")}>
            {plural(exceptions.length, "exception")}
          </span>
        )}
        {!demo && !noAccess && !u.hasPassword && <span className="flex-none rounded-sm bg-chip px-2 py-0.5 text-small text-mute-2">Not joined</span>}
        {!demo && u.twoFactor && <span className="flex-none rounded-sm bg-ok/12 px-2 py-0.5 text-small font-medium text-ok" title="Two-step verification is on">2-step on</span>}
      </span>
      <span className="hidden min-w-0 truncate text-meta text-mute-1 md:block">{ws.scopeLabel(u)}</span>
      <span className="hidden text-right text-meta tabular-nums text-mute-2 md:block">{waiting}<span className="sr-only"> waiting</span></span>
      <span className="flex flex-none items-center justify-end gap-1">
        {canViewAs && <Btn size="sm" className="max-sm:hidden" onClick={() => run(switchUser, u.id)}>View as</Btn>}
        {canAccess && <Btn size="sm" variant="ghost" className="max-sm:hidden" aria-label={`Access for ${u.name}`} onClick={editAccess}>Access</Btn>}
        {items.length > 0
          ? <CardMenu label={`More for ${u.name}`} items={items} triggerClassName="flex size-8 items-center justify-center rounded-lg text-mute-2 transition-colors duration-150 hover:bg-hover hover:text-ink" />
          : <span aria-hidden className="hidden size-8 sm:block" />}
      </span>
    </li>
  );
}

function Groups() {
  const { ws, open } = useApp();
  const canAccess = ws.can("access");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="m-0 max-w-[62ch] text-body text-mute-2">A group is a saved set of clients. Put someone in it and they get every client it covers, with no list to keep per person.</p>
        {canAccess && ws.d.groups.length > 0 && <Btn size="sm" onClick={() => open({ kind: "group" })}><Plus aria-hidden className="size-3.5" />New group</Btn>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ws.d.groups.map((g) => {
          const members = ws.d.users.filter((u) => u.groupIds.includes(g.id));
          return (
            <Card key={g.id} className="px-5 py-4">
              <div className="mb-1 flex items-baseline gap-2">
                <h3 className="m-0 text-body font-semibold">{g.name}</h3>
                <span className="flex-1" />
                <span className="text-small text-mute-3">{plural(members.length, "person", "people")}</span>
              </div>
              {g.note && <div className="mb-3 text-meta leading-[1.5] text-mute-1">{g.note}</div>}
              <div className="mb-3 flex flex-wrap gap-1">
                {g.clientIds.map((c) => ws.client(c)).filter(Boolean).map((c) => <span key={c!.id} className="rounded-sm bg-chip px-2 py-0.5 text-small text-mute-1">{c!.name}</span>)}
              </div>
              <div className="flex items-center gap-1 border-t border-divider pt-3">
                {members.map((m) => <Avatar key={m.id} initials={m.initials} size={24} title={m.name} />)}
                {!members.length && <span className="text-meta text-mute-3">Nobody in it yet</span>}
                <span className="flex-1" />
                {canAccess && (
                  <>
                    <Btn size="sm" variant="ghost" onClick={() => open({ kind: "group", draft: g })} aria-label={`Edit ${g.name}`}>Edit</Btn>
                    <Btn size="sm" variant="ghost" className="hover:text-danger" onClick={() => open({ kind: "confirm", item: "group", id: g.id, label: g.name })} aria-label={`Delete ${g.name}`}>Delete</Btn>
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
    </>
  );
}
