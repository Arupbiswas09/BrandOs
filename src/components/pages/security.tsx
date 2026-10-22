"use client";

import { useState, useTransition } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import {
  beginTwoFactor, confirmTwoFactor, disableTwoFactor, regenerateRecoveryCodes, revokeOtherSessions, revokeSession,
  type TwoFactorSetup,
} from "@/app/security-actions";
import { useApp } from "@/components/app/provider";
import { Btn, Card, Field } from "@/components/ui";
import { timeAgo } from "@/lib/time";

export type SecurityInfo = {
  hasPassword: boolean;
  twoFactor: boolean;
  recoveryLeft: number;
  sessions: { id: string; device: string; ip: string; createdAt: number; lastSeenAt: number; current: boolean }[];
};

/** Admins and managers can change a lot; a stolen password should not be enough. */
export function TwoFactorNudge({ onSetUp }: { onSetUp: () => void }) {
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[rgba(201,154,46,.35)] bg-[rgba(201,154,46,.08)] px-4 py-3">
      <ShieldAlert aria-hidden className="h-5 w-5 flex-none text-warn-text" />
      <p className="m-0 min-w-[220px] flex-1 text-body leading-[1.5] text-warn-ink">
        <strong className="font-semibold">Turn on two-step verification.</strong> Your role can change every client&apos;s work and who sees it,
        so a stolen password would be costly. It takes a minute with any authenticator app.
      </p>
      <Btn size="sm" onClick={onSetUp}>Set it up</Btn>
    </div>
  );
}

const codeInput = "field w-[12ch] text-center font-mono text-lead tracking-[0.2em]";

export function TwoFactorCard({ info }: { info: SecurityInfo }) {
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<Extract<TwoFactorSetup, { ok: true }> | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [manage, setManage] = useState<"off" | "codes" | null>(null);
  const [error, setError] = useState("");

  const begin = () => start(async () => {
    setError("");
    const r = await beginTwoFactor();
    if (!r.ok) return toast(r.error, "error");
    setSetup(r);
    setCode("");
  });
  const confirm = () => start(async () => {
    const r = await confirmTwoFactor(code);
    if (!r.ok) return setError(r.error);
    setError(""); setSetup(null); setCode(""); setCodes(r.codes);
    toast("Two-step verification is on.");
  });
  const doManage = () => start(async () => {
    if (manage === "off") {
      const r = await disableTwoFactor(code);
      if (!r.ok) return setError(r.error);
      toast("Two-step verification is off.");
    } else {
      const r = await regenerateRecoveryCodes(code);
      if (!r.ok) return setError(r.error);
      setCodes(r.codes);
    }
    setError(""); setManage(null); setCode("");
  });

  if (codes) return <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />;

  return (
    <Card className="mb-4 p-5">
      <div id="two-step" className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <h3 className="m-0 mb-0.5 flex items-center gap-2 text-body font-semibold">
            Two-step verification
            {info.twoFactor
              ? <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-0.5 text-small font-semibold text-ok"><ShieldCheck aria-hidden className="h-3.5 w-3.5" />On</span>
              : <span className="rounded-full bg-chip px-2.5 py-0.5 text-small font-semibold text-mute-2">Off</span>}
          </h3>
          <p className="m-0 text-meta leading-[1.5] text-mute-2">
            {info.twoFactor
              ? <>Signing in asks for a six-digit code from your authenticator app. You have {info.recoveryLeft} unused recovery code{info.recoveryLeft === 1 ? "" : "s"}{info.recoveryLeft <= 2 ? ". Make new ones soon" : ""}.</>
              : "After your password (or Google), BrandOS asks for a six-digit code from an app on your phone: Google Authenticator, 1Password, Microsoft Authenticator or similar."}
          </p>
        </div>
        {!info.twoFactor && !setup && <Btn variant="primary" onClick={begin} disabled={pending}>Set up two-step verification</Btn>}
        {info.twoFactor && !manage && (
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => { setManage("codes"); setError(""); }}>New recovery codes</Btn>
            <Btn variant="danger" onClick={() => { setManage("off"); setError(""); }}>Turn off</Btn>
          </div>
        )}
      </div>

      {setup && (
        <form className="mt-5 grid gap-5 border-t border-divider pt-5 sm:grid-cols-[auto_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
          <a href={setup.uri} aria-label="Open in an authenticator app on this device" className="block w-[184px] flex-none rounded-lg border border-line bg-surface p-2">
            <svg viewBox={`0 0 ${setup.qr.size} ${setup.qr.size}`} role="img" aria-label="QR code for your authenticator app" className="block h-auto w-full" shapeRendering="crispEdges">
              <rect width={setup.qr.size} height={setup.qr.size} fill="#fff" />
              <path d={setup.qr.d} fill="#101614" />
            </svg>
          </a>
          <div className="flex min-w-0 flex-col gap-3">
            <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-body leading-[1.5] text-mute-1">
              <li>Open your authenticator app and scan this code. On this phone? Tap the code instead.</li>
              <li>Cannot scan? Choose &ldquo;enter a setup key&rdquo; and type:
                <code className="mt-1 block break-all rounded-md bg-soft px-2.5 py-1.5 font-mono text-meta tracking-[0.08em] text-ink">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
              </li>
              <li>Enter the six-digit code the app shows.</li>
            </ol>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Code" required error={error || undefined}>
                <input required className={codeInput} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="\s*\d{3}\s*\d{3}\s*" maxLength={8} autoFocus />
              </Field>
              <Btn type="submit" variant="primary" disabled={pending || code.replace(/\s/g, "").length !== 6}>Turn on</Btn>
              <Btn onClick={() => { setSetup(null); setError(""); }}>Cancel</Btn>
            </div>
          </div>
        </form>
      )}

      {manage && (
        <form className="mt-5 flex flex-wrap items-end gap-2 border-t border-divider pt-5" onSubmit={(e) => { e.preventDefault(); doManage(); }}>
          <p className="m-0 mb-1 w-full text-body text-mute-2">
            {manage === "off" ? "To turn it off, enter a code from your app (or a recovery code)." : "Enter a code from your app. Your old recovery codes stop working."}
          </p>
          <Field label="Code" required error={error || undefined}>
            <input required className={codeInput} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={11} autoFocus />
          </Field>
          <Btn type="submit" variant={manage === "off" ? "danger" : "primary"} disabled={pending || !code.trim()}>{manage === "off" ? "Turn off" : "Make new codes"}</Btn>
          <Btn onClick={() => { setManage(null); setError(""); setCode(""); }}>Cancel</Btn>
        </form>
      )}
    </Card>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { toast } = useApp();
  const text = `BrandOS recovery codes\nEach works once, instead of a code from your app.\n\n${codes.join("\n")}\n`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Copied."); }
    catch { toast("Could not copy. Select the codes and copy them.", "error"); }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "brandos-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Card className="mb-4 p-5">
      <h3 id="two-step" className="m-0 mb-1 text-body font-semibold">Save your recovery codes</h3>
      <p className="m-0 mb-4 text-body leading-[1.5] text-mute-2">If you lose your phone, each of these gets you in once. Keep them in a password manager. You will not see them again.</p>
      <ul aria-label="Recovery codes" className="m-0 mb-5 grid list-none grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-soft p-4 font-mono text-body tracking-[0.06em] text-ink sm:grid-cols-4">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={copy}>Copy</Btn>
        <Btn onClick={download}>Download</Btn>
        <span className="flex-1" />
        <Btn variant="primary" onClick={onDone}>I have saved them</Btn>
      </div>
    </Card>
  );
}

export function SessionsCard({ info }: { info: SecurityInfo }) {
  const { ws, toast } = useApp();
  const [pending, start] = useTransition();
  const others = info.sessions.filter((x) => !x.current);
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => start(async () => {
    const r = await fn();
    if (!r.ok) toast(r.error, "error"); else toast(done);
  });
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-5 py-3">
        <h3 className="m-0 text-body font-semibold">Where you&apos;re signed in</h3>
        {others.length > 0 && (
          <Btn size="sm" disabled={pending} onClick={() => act(revokeOtherSessions, "Signed out everywhere else.")}>Sign out everywhere else</Btn>
        )}
      </div>
      {info.sessions.map((x) => (
        <div key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-divider px-5 py-3 first:border-t-0">
          <span className="min-w-[200px] flex-1">
            <span className="flex items-center gap-2 text-body font-semibold">
              {x.device}
              {x.current && <span className="rounded-full bg-soft px-2 py-px text-small font-semibold text-accent">This device</span>}
            </span>
            <span className="mt-0.5 block text-meta text-mute-2">
              {x.ip || "Unknown address"} · signed in {timeAgo(x.createdAt, ws.d.now)} · active {x.current ? "now" : timeAgo(x.lastSeenAt, ws.d.now)}
            </span>
          </span>
          {!x.current && (
            <Btn size="sm" disabled={pending} onClick={() => act(() => revokeSession(x.id), "Signed out that device.")}>Sign out that device</Btn>
          )}
        </div>
      ))}
      {!info.sessions.length && <p className="m-0 px-5 py-4 text-body text-mute-2">No sessions.</p>}
    </Card>
  );
}
