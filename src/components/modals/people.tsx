"use client";

import { useState } from "react";
import type { Access, Group } from "@/db/schema";
import { can } from "@/lib/access";
import { ACCESS_COLOR, ACCESS_LEVELS, ACCESS_NOTE, ROLE_OPTIONS } from "@/lib/constants";
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
  });
  const toggle = (k: "clientIds" | "groupIds" | "brandIds", v: string) =>
    setD((x) => ({ ...x, allClients: false, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const save = async () => { const r = await run(savePerson, { id: draft?.id, ...d }); if (r.ok) close(); };
  const roles = ROLE_OPTIONS.includes(d.role) ? ROLE_OPTIONS : [...ROLE_OPTIONS, d.role];

  return (
    <Modal title={draft?.id ? "Edit access" : "Invite someone"} sub="Two decisions: what they can do, and which clients they can see." width={560} onSubmit={save}
      footer={<Footer saveLabel={draft?.id ? "Save access" : "Add to the team"} pending={pending} disabled={!d.name.trim()} />} bodyClass="max-h-[60vh] gap-[18px] overflow-y-auto">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="field text-[16px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Marta Vieira" /></Field>
        <Field label="What they do"><Select value={d.role} onChange={(v) => setD({ ...d, role: v })} options={roles.map((r) => ({ value: r, label: r }))} /></Field>
      </div>
      <Field label="Email" hint={<span className="font-normal text-mute-4">used to sign in</span>}>
        <input type="email" className="field" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="marta@agency.com" />
      </Field>
      <div>
        <div className="label">What they can do</div>
        <div className="flex flex-col gap-[7px]" role="radiogroup">
          {ACCESS_LEVELS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={d.access === a} onClick={() => setD({ ...d, access: a })}
              className={cx("flex w-full items-start gap-[11px] rounded-[11px] border px-3.5 py-3 text-left transition", d.access === a ? "border-accent bg-soft" : "border-line bg-white")}>
              <span className="mt-1 h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: ACCESS_COLOR[a] }} />
              <span className="flex-1">
                <span className="block text-[16px] font-semibold">{a}</span>
                <span className="mt-0.5 block text-[14.5px] leading-[1.45] text-mute-1">{ACCESS_NOTE[a]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label">What they can see</div>
        <button type="button" role="checkbox" aria-checked={d.allClients} onClick={() => setD({ ...d, allClients: !d.allClients, clientIds: [], brandIds: [], groupIds: [] })}
          className="mb-2.5 flex w-full items-center gap-2.5 rounded-[11px] border border-line bg-white px-3.5 py-[11px] text-left hover:border-mute-2">
          <Tick on={d.allClients} /><span className="text-[16px] font-medium">Every client, including ones added later</span>
        </button>
        <div style={{ opacity: d.allClients ? 0.4 : 1 }}>
          <div className="eyebrow mb-[7px]">Or pick groups</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ws.d.groups.map((g) => {
              const on = d.groupIds.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => toggle("groupIds", g.id)} className={cx("rounded-full border px-[13px] py-1.5 text-[15px] font-medium transition", on ? "border-accent bg-soft" : "border-line bg-white")}>
                  {g.name} <span className="text-mute-3">· {g.clientIds.length} clients</span>
                </button>
              );
            })}
            {!ws.d.groups.length && <span className="text-[14.5px] text-mute-3">No groups yet.</span>}
          </div>
          <div className="eyebrow mb-[7px]">Or single clients</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ws.d.clients.filter((c) => !c.archived).map((c) => {
              const on = d.clientIds.includes(c.id);
              return <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle("clientIds", c.id)} className={cx("rounded-full border px-[13px] py-1.5 text-[15px] font-medium transition", on ? "border-accent bg-soft" : "border-line bg-white")}>{c.name}</button>;
            })}
          </div>
          <div className="eyebrow mb-[7px]">Or single brands</div>
          <div className="flex flex-wrap gap-1.5">
            {ws.d.brands.filter((b) => !b.archived).map((b) => {
              const on = d.brandIds.includes(b.id);
              return (
                <button key={b.id} type="button" aria-pressed={on} onClick={() => toggle("brandIds", b.id)} className={cx("flex items-center gap-1.5 rounded-full border px-[13px] py-1.5 text-[15px] font-medium transition", on ? "border-accent bg-soft" : "border-line bg-white")}>
                  <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: b.primary }} />{b.name}
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
      <Field label="Name"><input className="field text-[16px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Nonprofit pod" /></Field>
      <Field label="What it is for"><input className="field" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Everyone who touches faith and community work." /></Field>
      <div>
        <div className="label">Clients in it</div>
        <div className="flex flex-wrap gap-1.5">
          {ws.d.clients.filter((c) => !c.archived).map((c) => {
            const on = d.clientIds.includes(c.id);
            return <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle("clientIds", c.id)} className={cx("rounded-full border px-[13px] py-1.5 text-[15px] font-medium", on ? "border-accent bg-soft" : "border-line bg-white")}>{c.name}</button>;
          })}
        </div>
      </div>
      <div>
        <div className="label">People in it</div>
        <div className="flex flex-wrap gap-1.5">
          {ws.d.users.filter((u) => !u.allClients).map((u) => {
            const on = d.memberIds.includes(u.id);
            return (
              <button key={u.id} type="button" aria-pressed={on} onClick={() => toggle("memberIds", u.id)} className={cx("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[15px] font-medium", on ? "border-accent bg-soft" : "border-line bg-white")}>
                <Avatar initials={u.initials} size={20} />{u.name}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[14px] text-mute-3">People who already see every client are not listed.</div>
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
          className="flex w-full items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-left hover:bg-hover disabled:opacity-60">
          <Avatar initials={u.initials} size={28} />
          <span className="flex-1">
            <span className="block text-[16px] font-semibold">{u.name}{u.id === ws.me.id ? " (you)" : ""}</span>
            <span className="block text-[15px] text-mute-2">{u.role} · {u.access}</span>
          </span>
          <span className="font-mono text-[13.5px] text-mute-4" title="Items already waiting on them">{ws.d.queueCounts[u.id] ?? 0} waiting</span>
        </button>
      ))}
      {!people.length && <div className="p-6 text-center text-[15px] text-mute-2">Nobody else can review yet. Give someone Reviewer access on the Team page.</div>}
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
