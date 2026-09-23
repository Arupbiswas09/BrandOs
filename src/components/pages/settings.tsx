"use client";

import { useActionState, useState } from "react";
import { ROLE_OPTIONS } from "@/lib/constants";
import { signOut, updateProfile } from "@/app/actions";
import { changePassword } from "@/app/auth-actions";
import { useAction, useApp } from "@/components/app/provider";
import { useInstall } from "@/components/app/pwa";
import { useTakeover } from "@/components/app/shell";
import { Btn, Card, Field, H2, Page, PageHead, Select, cx } from "@/components/ui";

export function Settings() {
  const { ws, open } = useApp();
  const me = ws.me;
  const [run, pending] = useAction();
  const [name, setName] = useState(me.name);
  const [role, setRole] = useState(me.role);
  const [mode, setMode] = useTakeover();
  const { canPrompt, standalone, ios, install } = useInstall();
  const [pw, pwAction, pwPending] = useActionState(changePassword, undefined);
  const roles = ROLE_OPTIONS.includes(role) ? ROLE_OPTIONS : [...ROLE_OPTIONS, role];

  return (
    <Page className="max-w-[760px]">
      <PageHead eyebrow="Just for you" title="Settings" />
      <p className="mb-8 mt-1 text-[16px] text-mute-1">You are signed in as {me.email ?? me.name} with <strong className="font-semibold text-ink-3">{me.access}</strong> access. {ws.scopeLabel(me) === "Every client" ? "You can see every client." : `You can see: ${ws.scopeLabel(me)}.`}</p>

      <H2>Profile</H2>
      <Card className="mb-8 p-6">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void run(updateProfile, { name, role }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
            <Field label="What you do"><Select value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: r }))} /></Field>
          </div>
          <div><Btn type="submit" variant="primary" disabled={pending || (name === me.name && role === me.role)}>Save profile</Btn></div>
        </form>
      </Card>

      {ws.d.authMode === "password" && (
        <>
          <H2>Password</H2>
          <Card className="mb-8 p-6">
            <form action={pwAction} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current password"><input name="current" type="password" autoComplete="current-password" className="field" required /></Field>
                <Field label="New password"><input name="next" type="password" autoComplete="new-password" minLength={10} className="field" required /></Field>
              </div>
              {pw?.error && <div role="alert" className="text-[15px] text-change-ink">{pw.error}</div>}
              {pw?.email === "saved" && <div role="status" className="text-[15px] text-ok">Password changed.</div>}
              <div><Btn type="submit" variant="primary" disabled={pwPending}>Change password</Btn></div>
            </form>
          </Card>
        </>
      )}

      <H2>Display</H2>
      <Card className="mb-8 p-6">
        <div className="mb-2 text-[15px] font-semibold">Brand colours</div>
        <p className="mb-3 mt-0 text-[15px] text-mute-2">Inside a brand, BrandOS takes on that brand&apos;s colours. Turn it down if it gets in the way.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand colours">
          {([["bold", "Bold — tinted pages"], ["moderate", "Moderate — accents only"], ["off", "Off — always neutral"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
              className={cx("rounded-[9px] border px-3.5 py-2 text-[15px]", mode === k ? "border-accent bg-soft font-semibold" : "border-line bg-white hover:border-mute-4")}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-divider pt-4">
          <span className="flex-1 text-[15px] text-mute-2">Keyboard shortcuts make the everyday things one key away.</span>
          <Btn onClick={() => open({ kind: "shortcuts" })}>Show shortcuts</Btn>
        </div>
      </Card>

      <H2>App</H2>
      <Card className="mb-8 p-6">
        {standalone ? (
          <p className="m-0 text-[15px] text-mute-1">You are using the installed app. It updates itself whenever the team ships a change.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="m-0 min-w-[240px] flex-1 text-[15px] text-mute-1">Install BrandOS on this {ios ? "iPhone or iPad" : "computer or phone"}. It opens in its own window, gets a home-screen icon, and loads faster.</p>
            {canPrompt && <Btn variant="primary" onClick={() => install()}>Install the app</Btn>}
            {!canPrompt && <Btn onClick={() => open({ kind: "install" })}>How to install</Btn>}
          </div>
        )}
      </Card>

      {ws.can("access") && (
        <>
          <H2>Workspace data</H2>
          <Card className="mb-8 flex flex-wrap items-center gap-4 p-6">
            <p className="m-0 min-w-[240px] flex-1 text-[15px] text-mute-1">Download everything — clients, brands, offers, assets, discussion and activity — as one JSON file. Uploaded files are not included.</p>
            <a href="/api/export" className="rounded-[9px] border border-line bg-white px-4 py-2 text-[15px] font-semibold text-ink-3 hover:border-mute-2">Export JSON</a>
          </Card>
        </>
      )}

      <form action={signOut}><Btn type="submit" variant="danger">Sign out</Btn></form>
    </Page>
  );
}
