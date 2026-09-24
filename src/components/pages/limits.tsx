"use client";

import { useState } from "react";
import { FILE_KINDS, sizeLabel, type UploadPolicy } from "@/lib/upload-policy";
import { saveUploadPolicy } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Avatar, Btn, Card, Hint, cx } from "@/components/ui";

/** Team and access → Limits: what may be uploaded, how big, and how much space people get. */
export function UploadLimits() {
  const { ws, open } = useApp();
  const admin = ws.d.uploads.admin;
  if (!admin) return <Hint>Only admins can see and change upload limits.</Hint>;
  return <Editor key={JSON.stringify(admin.policy)} initial={admin.policy} usage={admin} onPerson={(id) => open({ kind: "person", draft: ws.user(id) })} />;
}

function Editor({ initial, usage, onPerson }: {
  initial: UploadPolicy;
  usage: NonNullable<ReturnType<typeof useApp>["ws"]["d"]["uploads"]["admin"]>;
  onPerson: (id: string) => void;
}) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const [p, setP] = useState(initial);
  const dirty = JSON.stringify(p) !== JSON.stringify(initial);
  const capMb = Math.floor(usage.hardCapBytes / 1024 / 1024);
  const setKind = (kind: keyof UploadPolicy["kinds"], patch: Partial<UploadPolicy["kinds"]["image"]>) =>
    setP((x) => ({ ...x, kinds: { ...x.kinds, [kind]: { ...x.kinds[kind], ...patch } } }));
  const save = async () => { const r = await run(saveUploadPolicy, p); if (r.ok) toast("Upload limits saved"); };

  const quotaBytes = p.workspaceQuotaGb != null ? p.workspaceQuotaGb * 1024 ** 3 : null;
  const pct = quotaBytes ? Math.min(100, Math.round((usage.workspaceBytes / quotaBytes) * 100)) : null;
  const people = ws.d.users
    .map((u) => ({ u, bytes: usage.byPerson[u.id] ?? 0 }))
    .filter((x) => x.bytes > 0 || x.u.storageQuotaMb != null || x.u.uploadLimitMb != null)
    .sort((a, b) => b.bytes - a.bytes);

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[14px] font-medium text-mute-2">Storage used</div>
            <div className="text-[26px] font-semibold tracking-[-0.02em]">{sizeLabel(usage.workspaceBytes)}{quotaBytes && <span className="text-[16px] font-normal text-mute-3"> of {sizeLabel(quotaBytes)}</span>}</div>
          </div>
          <p className="m-0 max-w-[48ch] text-[13.5px] text-mute-3">Limits apply to new uploads. Nothing already stored is removed. The server never accepts a single file over {sizeLabel(usage.hardCapBytes)} (MAX_UPLOAD_MB).</p>
        </div>
        {pct != null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-wash" role="progressbar" aria-label="Storage used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={cx("h-full rounded-full", pct > 90 ? "bg-[#DC2626]" : pct > 70 ? "bg-[#D97706]" : "bg-accent")} style={{ width: `${pct}%` }} />
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-divider bg-wash-2 px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-mute-2">What people may upload</div>
        {FILE_KINDS.map(({ kind, label, examples }) => {
          const k = p.kinds[kind];
          return (
            <div key={kind} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider px-5 py-3 last:border-b-0">
              <button type="button" role="switch" aria-checked={k.allowed} aria-label={`Allow ${label.toLowerCase()}`} onClick={() => setKind(kind, { allowed: !k.allowed })}
                className={cx("relative h-6 w-11 flex-none rounded-full transition", k.allowed ? "bg-accent" : "bg-line-strong")}>
                <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", k.allowed ? "left-[22px]" : "left-0.5")} />
              </button>
              <span className="min-w-[180px] flex-1">
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="block text-[13px] text-mute-3">{examples}</span>
              </span>
              <label className={cx("flex items-center gap-2 text-[14px] text-mute-2", !k.allowed && "opacity-40")}>
                Largest file
                <input type="number" min={1} max={capMb} disabled={!k.allowed} value={k.maxMb} aria-label={`Largest ${label.toLowerCase()} file in MB`}
                  onChange={(e) => setKind(kind, { maxMb: Math.max(1, Math.min(capMb, Number(e.target.value) || 1)) })} className="field w-[96px] py-1.5 text-right" />
                MB
              </label>
            </div>
          );
        })}
      </Card>

      <Card className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <NumberSetting label="Files per upload" hint="How many files one upload can add." value={p.maxFiles} min={1} max={200} onChange={(v) => setP({ ...p, maxFiles: v ?? 1 })} />
        <NumberSetting label="Storage for the workspace" unit="GB" hint="Leave empty for no cap." value={p.workspaceQuotaGb} min={1} max={100000} optional onChange={(v) => setP({ ...p, workspaceQuotaGb: v })} />
        <NumberSetting label="Storage per person" unit="MB" hint="Leave empty for no cap. You can set a different amount for one person." value={p.personQuotaMb} min={1} max={10000000} optional onChange={(v) => setP({ ...p, personQuotaMb: v })} />
      </Card>

      <div className="flex items-center gap-3">
        <Btn variant="primary" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save limits"}</Btn>
        {dirty && <Btn onClick={() => setP(initial)}>Undo changes</Btn>}
      </div>

      {people.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-divider bg-wash-2 px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-mute-2">Who is using the space</div>
          {people.map(({ u, bytes }) => {
            const quota = u.storageQuotaMb ?? p.personQuotaMb;
            return (
              <button key={u.id} type="button" onClick={() => onPerson(u.id)} className="flex w-full items-center gap-3 border-b border-divider px-5 py-2.5 text-left last:border-b-0 hover:bg-wash">
                <Avatar initials={u.initials} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{u.name}</span>
                  <span className="block text-[13px] text-mute-3">
                    {[u.storageQuotaMb != null && "own storage allowance", u.uploadLimitMb != null && `largest file ${u.uploadLimitMb} MB`].filter(Boolean).join(" · ") || "workspace defaults"}
                  </span>
                </span>
                <span className="flex-none text-[14px] text-mute-1">{sizeLabel(bytes)}{quota != null && <span className="text-mute-3"> / {sizeLabel(quota * 1024 * 1024)}</span>}</span>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function NumberSetting({ label, hint, unit, value, min, max, optional, onChange }: {
  label: string; hint: string; unit?: string; value: number | null; min: number; max: number; optional?: boolean; onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={min} max={max} value={value ?? ""} placeholder={optional ? "No cap" : undefined} className="field"
          onChange={(e) => { const v = e.target.value; onChange(v === "" ? (optional ? null : min) : Math.max(min, Math.min(max, Number(v)))); }} />
        {unit && <span className="text-[14px] text-mute-2">{unit}</span>}
      </span>
      <span className="mt-1 block text-[12.5px] text-mute-3">{hint}</span>
    </label>
  );
}
