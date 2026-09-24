"use client";

import Form from "next/form";
import Link from "next/link";
import { Download } from "lucide-react";
import { useApp } from "@/components/app/provider";
import { Avatar, Btn, Card, Empty, Field, Page, PageHead, Tabs, cx } from "@/components/ui";
import { AUDIT_KINDS, AUDIT_PAGE_SIZE, SECURITY, auditSearch, type AuditQuery } from "@/lib/audit";

export type AuditRow = { id: string; at: number; userId: string; who: string; action: string; type: string; label: string; field: string };

const TYPE: Record<string, string> = {
  security: "Security", person: "People", client: "Client", brand: "Brand", service: "Service",
  offer: "Offer", asset: "Asset", cta: "CTA", group: "Group",
};

const initials = (name: string) => name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

/** The same instant for everyone, whatever their timezone, so server and browser agree. */
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export function AuditLog({ allowed, rows, people, total, query }: {
  allowed: boolean; rows: AuditRow[]; people: { id: string; name: string; access: string }[]; total: number; query: AuditQuery;
}) {
  const { ws } = useApp();

  if (!allowed) {
    return (
      <Page className="max-w-[860px]">
        <PageHead eyebrow="Security" title="Audit log" />
        <Empty art="people" title="This page is not for your role" body="The audit log shows who signed in and who changed access, shares and deletions. Only admins can see it. Ask an admin if you need to check something." />
      </Page>
    );
  }

  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const filtered = !!(query.person || query.from || query.to || query.q || query.kind !== "all");
  const first = total ? (page - 1) * AUDIT_PAGE_SIZE + 1 : 0;
  const last = Math.min(total, page * AUDIT_PAGE_SIZE);

  return (
    <Page className="max-w-[1080px]">
      <PageHead
        eyebrow="Security"
        title="Audit log"
        sub="Every sign-in, access change, share, export and deletion, newest first. Only admins can see this page."
        actions={<a href={`/api/audit${auditSearch({ ...query, page: 1 })}`} className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-white px-[13px] py-[7px] text-[15px] font-medium text-ink-3 transition-colors hover:border-line-strong hover:bg-wash"><Download className="h-4 w-4" />Export CSV</a>}
        tabs={<Tabs items={AUDIT_KINDS.map((k) => ({ key: k.value, label: k.label, active: query.kind === k.value, href: `/audit${auditSearch({ ...query, kind: k.value, page: 1 })}` }))} />}
      />

      <Form key={auditSearch(query)} action="/audit" className="mb-5 grid rounded-xl border border-line bg-white p-4 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] lg:items-end">
        {query.kind !== "all" && <input type="hidden" name="kind" value={query.kind} />}
        <Field label="Search">
          <input name="q" type="search" defaultValue={query.q} placeholder="Email, name, detail…" className="field" />
        </Field>
        <Field label="Person">
          <select name="person" defaultValue={query.person} className="field">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.access})</option>)}
          </select>
        </Field>
        <Field label="From">
          <input name="from" type="date" defaultValue={query.from} className="field" />
        </Field>
        <Field label="To">
          <input name="to" type="date" defaultValue={query.to} className="field" />
        </Field>
        <div className="flex gap-2">
          <Btn type="submit" variant="primary">Filter</Btn>
          {filtered && <Link href="/audit" className="inline-flex items-center rounded-[8px] px-[13px] py-[7px] text-[15px] text-mute-2 hover:text-ink">Clear</Link>}
        </div>
      </Form>

      {!rows.length ? (
        <Empty art={filtered ? "search" : "calendar"} title={filtered ? "Nothing matches those filters" : "Nothing logged yet"} body={filtered ? "Try a wider date range, another person or a different search." : "Sign-ins, access changes, shares and deletions will show up here as they happen."} />
      ) : (
        <>
          <p className="mb-2 mt-0 text-[13.5px] text-mute-3">Showing {first}–{last} of {total.toLocaleString("en")} · dates are in UTC</p>
          <Card className="overflow-hidden">
            {rows.map((r) => {
              const failed = r.action.startsWith("failed");
              return (
                <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-t border-divider px-5 py-3 transition-colors first:border-t-0 hover:bg-wash">
                  <span className="w-[150px] flex-none pt-0.5 text-[13px] text-mute-3" title={utc(r.at)}>
                    <span className="block text-ink-3">{ws.ago(r.at)}</span>
                    <span className="block font-mono text-[12px]">{utc(r.at)}</span>
                  </span>
                  <span className="min-w-[220px] flex-1">
                    <span className="flex items-center gap-2 text-[15px]">
                      <Avatar initials={initials(r.who)} size={22} />
                      <span className="font-semibold">{r.who}</span>
                      <span className={cx(failed ? "font-semibold text-danger" : "text-ink-3")}>{r.action}</span>
                      <span className="min-w-0 truncate font-medium text-ink">{r.label}</span>
                    </span>
                    {r.field && <span className="mt-0.5 block pl-[30px] text-[13.5px] text-mute-2">{r.field}</span>}
                  </span>
                  <span className={cx("flex-none rounded-[5px] px-2 py-1 text-[12.5px] font-semibold", r.type === SECURITY ? "bg-soft text-accent" : "bg-chip text-mute-1")}>{TYPE[r.type] ?? r.type}</span>
                </div>
              );
            })}
          </Card>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-5 flex items-center justify-between gap-3 text-[14.5px]">
              {page > 1 ? <Link href={`/audit${auditSearch({ ...query, page: page - 1 })}`} className="font-semibold text-accent hover:underline">← Newer</Link> : <span />}
              <span className="text-mute-3">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/audit${auditSearch({ ...query, page: page + 1 })}`} className="font-semibold text-accent hover:underline">Older →</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </Page>
  );
}
