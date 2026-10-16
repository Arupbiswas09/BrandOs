"use client";

import { useState } from "react";
import type { Access, Group } from "@/db/schema";
import { NO_ACCESS_LABEL, OVERRIDABLE, PERM_INFO, ROLES, can, cleanOverrides, roleCan, type Perm } from "@/lib/access";
import { cellFor } from "@/components/pages/access";
import { ACCESS_COLOR, ACCESS_NOTE, ROLE_OPTIONS } from "@/lib/constants";
import type { PublicUser } from "@/lib/types";
import { requestChanges, saveGroup, savePerson, sendForReview } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Avatar, Btn, Field, Select, Tick, cx } from "@/components/ui";
import { Footer, Modal } from "./frame";
import type { ItemKind } from "./types";

export function PersonModal({ draft }: { draft?: Partial<PublicUser> }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const [d, setD] = useState({
    name: draft?.name ?? "",
    email: draft?.email ?? "",
    role: draft?.role ?? "Team member",
    access: (draft?.access ?? "Editor") as Access,
    allClients: draft?.allClients ?? false,
    clientIds: draft?.clientIds ?? [],
    brandIds: draft?.brandIds ?? [],
    groupIds: draft?.groupIds ?? [],
    permOverrides: (draft?.permOverrides ?? {}) as Partial<Record<Perm, boolean>>,
    uploadLimitMb: draft?.uploadLimitMb ?? null,
    storageQuotaMb: draft?.storageQuotaMb ?? null,
  });
  const toggle = (k: "clientIds" | "groupIds" | "brandIds", v: string) =>
    setD((x) => ({ ...x, allClients: false, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const save = async () => { const r = await run(savePerson, { id: draft?.id, ...d, permOverrides: cleanOverrides(d.access, d.permOverrides) }); if (r.ok) close(); };
  const effective = { access: d.access, permOverrides: cleanOverrides(d.access, d.permOverrides) };
  const roles = ROLE_OPTIONS.includes(d.role) ? ROLE_OPTIONS : [...ROLE_OPTIONS, d.role];
  // The old Client role is not offered. Someone who still has it has no access until a role is picked here.
  const noAccess = d.access === "Client";
  const first = d.name.split(" ")[0] || "they";

  return (
    <Modal title={draft?.id ? "Edit access" : "Invite someone"} sub="Two decisions: their role (what they can do) and their scope (which clients they can see)." width={640} onSubmit={save}
      footer={<Footer saveLabel={draft?.id ? "Save access" : "Add to the team"} pending={pending} disabled={!d.name.trim()} />} bodyClass="max-h-[60vh] gap-4 overflow-y-auto">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Marta Vieira" /></Field>
        <Field label="What they do"><Select value={d.role} onChange={(v) => setD({ ...d, role: v })} options={roles.map((r) => ({ value: r, label: r }))} /></Field>
      </div>
      <Field label="Email" hint={<span className="font-normal text-mute-4">used to sign in</span>}>
        <input type="email" className="field" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="marta@agency.com" />
      </Field>
      <div>
        <div className="label">Role: what they can do<span aria-hidden className="ml-0.5 text-mute-3">*</span></div>
        {noAccess && (
          <p className="mb-2.5 mt-0 rounded-lg bg-wash px-3 py-2 text-meta text-mute-1">
            <b className="font-semibold text-ink">{NO_ACCESS_LABEL}.</b> {first === "they" ? "This person" : first} had the old Client role and cannot sign in. Pick a role to give them access.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Role" aria-required="true">
          {ROLES.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={d.access === a} onClick={() => setD({ ...d, access: a })}
              className={cx("flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150", d.access === a ? "border-accent bg-soft ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong")}>
              <span aria-hidden className="mt-2 size-2 flex-none rounded-sm" style={{ background: ACCESS_COLOR[a] }} />
              <span className="flex-1">
                <span className="block text-body font-semibold">{a}</span>
                <span className="mt-0.5 block text-small leading-[1.4] text-mute-2">{ACCESS_NOTE[a]}</span>
              </span>
            </button>
          ))}
        </div>
        {!noAccess && <div className="mt-3 rounded-xl bg-wash px-3.5 py-3">
          <div className="mb-1.5 text-small font-semibold text-mute-1">As {/^[AEIOU]/.test(d.access) ? "an" : "a"} {d.access}{Object.keys(effective.permOverrides).length ? " with the exceptions below" : ""}, {first} can:</div>
          <div className="flex flex-wrap gap-1.5">
            {PERM_INFO.map((p) => {
              let c = cellFor(d.access, p.perm);
              // Exceptions decide the plain yes/no permissions.
              if ((OVERRIDABLE as string[]).includes(p.perm)) {
                const yes = can(effective, p.perm as Perm);
                c = !yes ? "no" : c === "no" ? "yes" : c;
              }
              if (c === "no") return null;
              return <span key={p.perm} className="rounded-full bg-surface px-2.5 py-1 text-small font-medium text-ink-3 ring-1 ring-line">{p.label}{c === "own" ? " (own work)" : ""}</span>;
            })}
          </div>
        </div>}
      </div>
      <details className="group rounded-xl border border-line" open={Object.keys(d.permOverrides).length > 0 || d.uploadLimitMb != null || d.storageQuotaMb != null}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex-1">
            <span className="block text-body font-semibold">Exceptions and limits for {d.name.split(" ")[0] || "this person"}</span>
            <span className="block text-small text-mute-2">Block or allow single permissions on top of the role, and cap their uploads.</span>
          </span>
          <span aria-hidden className="text-mute-3 group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-divider px-3.5 pb-3.5 pt-2">
          {OVERRIDABLE.map((perm) => {
            const info = PERM_INFO.find((x) => x.perm === perm)!;
            const role = roleCan(d.access, perm);
            const v = d.permOverrides[perm];
            const set = (x: boolean | undefined) => setD((y) => {
              const o = { ...y.permOverrides };
              if (x === undefined || x === role) delete o[perm]; else o[perm] = x;
              return { ...y, permOverrides: o };
            });
            return (
              <div key={perm} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-2 last:border-b-0">
                <span className="min-w-[170px] flex-1">
                  <span className="block text-meta font-medium">{info.label}</span>
                  <span className="block text-small text-mute-3">Role says: {role ? "yes" : "no"}</span>
                </span>
                <span className="flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label={info.label}>
                  {([["Role", undefined], ["Allow", true], ["Block", false]] as const).map(([label, val]) => {
                    const on = val === undefined ? v === undefined : v === val;
                    const disabled = noAccess || (val === true && role) || (val === false && !role);
                    return (
                      <button key={label} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => set(val)}
                        className={cx("rounded-md px-2.5 py-1 text-small font-medium transition disabled:cursor-not-allowed disabled:opacity-30",
                          on ? (val === false ? "bg-danger/10 text-danger" : val === true ? "bg-ok/12 text-ok" : "bg-wash text-ink") : "text-mute-2 hover:text-ink")}>
                        {label}
                      </button>
                    );
                  })}
                </span>
              </div>
            );
          })}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Largest file they may upload" hint={<span className="font-normal text-mute-4">MB</span>}>
              <input type="number" min={1} className="field" placeholder="Workspace limit" value={d.uploadLimitMb ?? ""} onChange={(e) => setD({ ...d, uploadLimitMb: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
            </Field>
            <Field label="Their storage allowance" hint={<span className="font-normal text-mute-4">MB</span>}>
              <input type="number" min={0} className="field" placeholder="Workspace default" value={d.storageQuotaMb ?? ""} onChange={(e) => setD({ ...d, storageQuotaMb: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
            </Field>
          </div>
          <p className="m-0 mt-2 text-small text-mute-3">A person&apos;s own file limit can only be lower than the limit for that kind of file. Managing the team always stays with the Admin role.</p>
        </div>
      </details>
      <div>
        <div className="label">Scope: what they can see</div>
        <button type="button" role="checkbox" aria-checked={d.allClients} disabled={noAccess} onClick={() => setD({ ...d, allClients: !d.allClients, clientIds: [], brandIds: [], groupIds: [] })}
          className="mb-2.5 flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:border-mute-2 disabled:cursor-not-allowed disabled:opacity-40">
          <Tick on={d.allClients} /><span className="text-lead font-medium">Every client, including ones added later</span>
        </button>
        <div style={{ opacity: d.allClients ? 0.4 : 1 }}>
          <div className="eyebrow mb-2">Or pick groups</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ws.d.groups.map((g) => {
              const on = d.groupIds.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => toggle("groupIds", g.id)} className={cx("rounded-full border px-3 py-1.5 text-body font-medium transition", on ? "border-accent bg-soft" : "border-line bg-surface")}>
                  {g.name} <span className="text-mute-3">· {g.clientIds.length} clients</span>
                </button>
              );
            })}
            {!ws.d.groups.length && <span className="text-body text-mute-3">No groups yet.</span>}
          </div>
          <div className="eyebrow mb-2">Or single clients</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ws.d.clients.filter((c) => !c.archived).map((c) => {
              const on = d.clientIds.includes(c.id);
              return <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle("clientIds", c.id)} className={cx("rounded-full border px-3 py-1.5 text-body font-medium transition", on ? "border-accent bg-soft" : "border-line bg-surface")}>{c.name}</button>;
            })}
          </div>
          <div className="eyebrow mb-2">Or single brands</div>
          <div className="flex flex-wrap gap-1.5">
            {ws.d.brands.filter((b) => !b.archived).map((b) => {
              const on = d.brandIds.includes(b.id);
              return (
                <button key={b.id} type="button" aria-pressed={on} onClick={() => toggle("brandIds", b.id)} className={cx("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-body font-medium transition", on ? "border-accent bg-soft" : "border-line bg-surface")}>
                  <span className="h-[7px] w-[7px] rounded-sm" style={{ background: b.primary }} />{b.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function GroupModal({ draft }: { draft?: Partial<Group> }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const [d, setD] = useState({
    name: draft?.name ?? "",
    note: draft?.note ?? "",
    clientIds: draft?.clientIds ?? [],
    memberIds: ws.d.users.filter((u) => draft?.id && u.groupIds.includes(draft.id)).map((u) => u.id),
  });
  const toggle = (k: "clientIds" | "memberIds", v: string) => setD((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const save = async () => { const r = await run(saveGroup, { id: draft?.id, ...d }); if (r.ok) close(); };
  return (
    <Modal title={draft?.id ? "Edit group" : "New group"} sub="A saved set of clients. Everyone in the group sees all of them." width={540} onSubmit={save} footer={<Footer saveLabel="Save group" pending={pending} disabled={!d.name.trim()} />}>
      <Field label="Name" required><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Nonprofit pod" /></Field>
      <Field label="What it is for"><input className="field" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Everyone who touches faith and community work." /></Field>
      <div>
        <div className="label">Clients in it</div>
        <div className="flex flex-wrap gap-1.5">
          {ws.d.clients.filter((c) => !c.archived).map((c) => {
            const on = d.clientIds.includes(c.id);
            return <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle("clientIds", c.id)} className={cx("rounded-full border px-3 py-1.5 text-body font-medium", on ? "border-accent bg-soft" : "border-line bg-surface")}>{c.name}</button>;
          })}
        </div>
      </div>
      <div>
        <div className="label">People in it</div>
        <div className="flex flex-wrap gap-1.5">
          {ws.d.users.filter((u) => !u.allClients).map((u) => {
            const on = d.memberIds.includes(u.id);
            return (
              <button key={u.id} type="button" aria-pressed={on} onClick={() => toggle("memberIds", u.id)} className={cx("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-body font-medium", on ? "border-accent bg-soft" : "border-line bg-surface")}>
                <Avatar initials={u.initials} size={20} />{u.name}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-meta text-mute-3">People who already see every client are not listed.</div>
      </div>
    </Modal>
  );
}

export function SendReviewModal({ item, id }: { item: ItemKind; id: string }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const x = item === "asset" ? ws.asset(id) : ws.offer(id);
  const people = ws.d.users.filter((u) => u.id !== x?.ownerId && can(u, "review"));
  return (
    <Modal title="Who should review this?" sub={x?.name} width={440} footer={<Btn variant="ghost" onClick={close}>Cancel</Btn>} bodyClass="gap-0 px-3 pb-3.5 pt-2">
      {people.map((u) => (
        <button key={u.id} type="button" disabled={pending} onClick={async () => { const r = await run(sendForReview, item, id, u.id); if (r.ok) close(); }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover disabled:opacity-60">
          <Avatar initials={u.initials} size={28} />
          <span className="flex-1">
            <span className="block text-lead font-semibold">{u.name}{u.id === ws.me.id ? " (you)" : ""}</span>
            <span className="block text-body text-mute-2">{u.role} · {u.access}</span>
          </span>
          <span className="text-meta tabular-nums text-mute-3" title="Items already waiting on them">{ws.d.queueCounts[u.id] ?? 0} waiting</span>
        </button>
      ))}
      {!people.length && <div className="p-6 text-center text-body text-mute-2">Nobody else can review yet. Give someone Reviewer access on the Team page.</div>}
    </Modal>
  );
}

export function ReqChangesModal({ item, id }: { item: ItemKind; id: string }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const [note, setNote] = useState("");
  const x = item === "asset" ? ws.asset(id) : ws.offer(id);
  const save = async () => { const r = await run(requestChanges, item, id, note); if (r.ok) close(); };
  return (
    <Modal title="Request changes" sub={`${x?.name} goes back to ${ws.user(x?.ownerId).name} with your note attached.`} width={460} onSubmit={save}
      footer={<Footer saveLabel="Send it back" pending={pending} disabled={!note.trim()} saveVariant="change-solid" />}>
      <textarea rows={4} className="field leading-[1.55]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say what needs to change, not that something does." aria-label="What needs to change" />
    </Modal>
  );
}
