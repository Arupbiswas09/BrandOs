"use client";

import { Check, Minus } from "lucide-react";
import { PERMISSIONS, PERM_INFO, ROLES, ROLE_INFO, scopeOf, seesBrand, seesClient } from "@/lib/access";
import type { Access } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { Avatar, Card, Hint } from "@/components/ui";

type Cell = "yes" | "no" | "own" | "shared";

/** One cell of the role table, including the two rules that are not plain yes/no. */
export function cellFor(role: Access, perm: (typeof PERM_INFO)[number]["perm"]): Cell {
  const p = PERMISSIONS[role];
  if (perm === "view") return role === "Client" ? "shared" : "yes";
  if (perm === "own") return p.edit && role !== "Contributor" ? "yes" : "no";
  if (perm === "edit" && role === "Contributor") return "own";
  if (role === "Client" && p[perm]) return "shared";
  return p[perm] ? "yes" : "no";
}

function Mark({ cell }: { cell: Cell }) {
  if (cell === "yes") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#DCFCE7] text-[#166534]" aria-label="Yes"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>;
  if (cell === "own") return <span className="inline-block rounded-full bg-[#E0F2FE] px-2 py-0.5 text-[12px] font-semibold text-[#075985]">Own work</span>;
  if (cell === "shared") return <span className="inline-block rounded-full bg-[#FCE7F3] px-2 py-0.5 text-[12px] font-semibold text-[#9D174D]">Shared only</span>;
  return <span className="inline-flex h-6 w-6 items-center justify-center text-mute-5" aria-label="No"><Minus className="h-4 w-4" /></span>;
}

export function RoleMatrix() {
  const { ws } = useApp();
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="px-4 py-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <RoleChip role={r} />
              {ROLE_INFO[r].guest && <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mute-3">Guest</span>}
              <span className="flex-1" />
              <span className="text-[13.5px] text-mute-3">{plural(ws.d.users.filter((u) => u.access === r).length, "person", "people")}</span>
            </div>
            <div className="text-[14px] leading-[1.5] text-mute-1 text-pretty">{ROLE_INFO[r].summary}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto" data-scroll>
          <table className="w-full min-w-[860px] border-collapse text-left">
            <caption className="sr-only">What each role can do</caption>
            <thead>
              <tr className="border-b border-line bg-wash-2">
                <th scope="col" className="w-[290px] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.05em] text-mute-2">Can they…</th>
                {ROLES.map((r) => <th key={r} scope="col" className="px-2 py-3 text-center"><RoleChip role={r} /></th>)}
              </tr>
            </thead>
            <tbody>
              {PERM_INFO.map((p) => (
                <tr key={p.perm} className="border-b border-divider last:border-b-0 hover:bg-wash-2">
                  <th scope="row" className="px-5 py-2.5 font-normal">
                    <span className="block text-[14.5px] font-medium text-ink">{p.label}</span>
                    <span className="block text-[13px] text-mute-3">{p.note}</span>
                  </th>
                  {ROLES.map((r) => <td key={r} className="px-2 py-2.5 text-center"><Mark cell={cellFor(r, p.perm)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Hint className="mt-4">
        Roles decide what someone can <b className="font-semibold">do</b>. Scope decides what they can <b className="font-semibold">see</b>: every client, or only the clients, brands and groups you pick. Buttons a person cannot use are hidden, and the server refuses the change anyway if someone tries.
      </Hint>
    </>
  );
}

/** For each client: who can see it and what their role lets them do there. */
export function AccessMap() {
  const { ws } = useApp();
  const clients = live(ws.d.clients);
  const brands = ws.d.brands;
  const people = ws.d.users.map((u) => ({ u, scope: scopeOf(u, ws.d.groups) }));
  return (
    <>
      <p className="mb-4 mt-0 max-w-[70ch] text-[15px] text-mute-2">Everyone who can open each client, and what they can do there. Change it from a person&apos;s <b className="font-semibold text-ink">Access</b> button on the People tab.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {clients.map((c) => {
          const cb = brands.filter((b) => b.clientId === c.id);
          const who = people.filter(({ scope }) => seesClient(scope, c.id, brands));
          return (
            <Card key={c.id} className="px-5 py-4">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[16px] font-semibold">{c.name}</span>
                <span className="flex-1" />
                <span className="text-[13.5px] text-mute-3">{who.length} {who.length === 1 ? "person" : "people"}</span>
              </div>
              {who.map(({ u, scope }) => {
                const partial = !scope.all && !scope.clients.has(c.id);
                const only = partial ? cb.filter((b) => seesBrand(scope, b)).map((b) => b.name).join(", ") : "";
                return (
                  <div key={u.id} className="flex items-center gap-2.5 border-t border-divider py-2">
                    <Avatar initials={u.initials} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{u.name}</span>
                      <span className="block truncate text-[13px] text-mute-3">{scope.all ? "Every client" : partial ? `Only ${only}` : "The whole client"}{u.access === "Client" ? " · shared items only" : ""}</span>
                    </span>
                    <RoleChip role={u.access} />
                  </div>
                );
              })}
              {!who.length && <div className="border-t border-divider py-3 text-[14px] text-mute-3">Nobody has been given this client.</div>}
            </Card>
          );
        })}
      </div>
    </>
  );
}

export function RoleChip({ role }: { role: Access }) {
  const c = ROLE_INFO[role].color;
  return <span className="inline-block flex-none rounded-[5px] px-2 py-[3px] text-[12.5px] font-semibold" style={{ background: hexA(c, 0.12), color: readable(c, 0.12) }}>{role}</span>;
}
