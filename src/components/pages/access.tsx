"use client";

import { Check, Minus } from "lucide-react";
import { NO_ACCESS_LABEL, PERMISSIONS, PERM_INFO, ROLES, ROLE_INFO, scopeOf, seesBrand, seesClient } from "@/lib/access";
import type { Access } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { Avatar, Card, Hint } from "@/components/ui";

type Cell = "yes" | "no" | "own";

/** One cell of the role table, including the one rule that is not plain yes/no. */
export function cellFor(role: Access, perm: (typeof PERM_INFO)[number]["perm"]): Cell {
  // The old Client role has no access at all.
  if (role === "Client") return "no";
  const p = PERMISSIONS[role];
  if (perm === "view") return "yes";
  if (perm === "own") return p.edit && role !== "Contributor" ? "yes" : "no";
  if (perm === "edit" && role === "Contributor") return "own";
  return p[perm] ? "yes" : "no";
}

function Mark({ cell }: { cell: Cell }) {
  if (cell === "yes") return <span className="inline-flex size-6 items-center justify-center rounded-full bg-ok/12 text-ok" role="img" aria-label="Yes"><Check aria-hidden className="size-3.5" strokeWidth={3} /></span>;
  if (cell === "own") return <span className="inline-block rounded-full bg-accent/10 px-2 py-0.5 text-micro font-semibold text-accent">Own work</span>;
  return <span className="inline-flex size-6 items-center justify-center text-mute-3" role="img" aria-label="No"><Minus aria-hidden className="size-4" /></span>;
}

export function RoleMatrix() {
  const { ws } = useApp();
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r} className="px-4 py-3">
            <div className="mb-1 flex items-center gap-2">
              <RoleChip role={r} />
              <span className="flex-1" />
              <span className="text-small text-mute-3">{plural(ws.d.users.filter((u) => u.access === r).length, "person", "people")}</span>
            </div>
            <div className="text-meta leading-[1.5] text-mute-1 text-pretty">{ROLE_INFO[r].summary}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="focus-inset overflow-x-auto" data-scroll tabIndex={0} role="region" aria-label="What each role can do (scrolls sideways)">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">What each role can do</caption>
            <thead>
              <tr className="border-b border-line bg-wash-2">
                <th scope="col" className="w-[290px] px-5 py-2.5 text-small font-semibold text-mute-2">Can they…</th>
                {ROLES.map((r) => <th key={r} scope="col" className="px-2 py-2.5 text-center"><RoleChip role={r} /></th>)}
              </tr>
            </thead>
            <tbody>
              {PERM_INFO.map((p) => (
                <tr key={p.perm} className="border-b border-divider last:border-b-0 hover:bg-wash-2">
                  <th scope="row" className="px-5 py-2 font-normal">
                    <span className="block text-meta font-medium text-ink">{p.label}</span>
                    <span className="block text-small text-mute-3">{p.note}</span>
                  </th>
                  {ROLES.map((r) => <td key={r} className="px-2 py-2 text-center"><Mark cell={cellFor(r, p.perm)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Hint className="mt-4">
        Roles decide what someone can <b className="font-semibold">do</b>. Scope decides what they can <b className="font-semibold">see</b>: every client, or only the clients, brands and groups you pick. Admins can also block or allow single permissions for one person (their <b className="font-semibold">Access</b> button, then Exceptions and limits), and set upload limits in Settings. Buttons a person cannot use are hidden, and the server refuses the change anyway if someone tries.
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
      <p className="mb-4 mt-0 max-w-[70ch] text-body text-mute-2">Everyone who can open each client, and what they can do there. Change it from a person&apos;s <b className="font-semibold text-ink">Access</b> button on the People tab.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {clients.map((c) => {
          const cb = brands.filter((b) => b.clientId === c.id);
          const who = people.filter(({ scope }) => seesClient(scope, c.id, brands));
          return (
            <Card key={c.id} className="px-5 py-3.5">
              <div className="mb-1.5 flex items-baseline gap-2">
                <h3 className="m-0 text-body font-semibold">{c.name}</h3>
                <span className="flex-1" />
                <span className="text-small text-mute-3">{plural(who.length, "person", "people")}</span>
              </div>
              {who.map(({ u, scope }) => {
                const partial = !scope.all && !scope.clients.has(c.id);
                const only = partial ? cb.filter((b) => seesBrand(scope, b)).map((b) => b.name).join(", ") : "";
                return (
                  <div key={u.id} className="flex h-12 items-center gap-2.5 border-t border-divider">
                    <Avatar initials={u.initials} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-meta font-medium">{u.name}</span>
                      <span className="block truncate text-small text-mute-3">{scope.all ? "Every client" : partial ? `Only ${only}` : "The whole client"}</span>
                    </span>
                    <RoleChip role={u.access} />
                  </div>
                );
              })}
              {!who.length && <div className="border-t border-divider py-3 text-meta text-mute-3">Nobody has been given this client.</div>}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/** A person's role as a small tinted chip. The old Client role reads "No access". */
export function RoleChip({ role }: { role: Access }) {
  const c = ROLE_INFO[role].color;
  return <span className="inline-block flex-none whitespace-nowrap rounded-sm px-2 py-0.5 text-small font-semibold" style={{ background: hexA(c, 0.12), color: readable(c, 0.2) }}>{role === "Client" ? NO_ACCESS_LABEL : role}</span>;
}
