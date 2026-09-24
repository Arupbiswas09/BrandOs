"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { ROLE_OPTIONS } from "@/lib/constants";
import { saveNotifyPrefs, sendSlackTest, signOut, updateProfile } from "@/app/actions";
import type { NotifyEvent, NotifyMode } from "@/db/schema";
import { NOTIFY_EVENTS, NOTIFY_MODES, fullPrefs } from "@/lib/notify";
import { CalendarFeedCard } from "@/components/calendar-feed";
import { changePassword } from "@/app/auth-actions";
import { useAction, useApp } from "@/components/app/provider";
import { useInstall } from "@/components/app/pwa";
import { usePalette, useTakeover } from "@/components/app/shell";
import { PALETTES, PALETTE_KEYS } from "@/components/app/theme";
import { Btn, Card, Field, H2, Hint, Page, PageHead, Select, Warn, cx } from "@/components/ui";

export function Settings() {
  const { ws, open } = useApp();
  const me = ws.me;
  const [run, pending] = useAction();
  const [name, setName] = useState(me.name);
  const [role, setRole] = useState(me.role);
  const [mode, setMode] = useTakeover();
  const [palette, setPalette] = usePalette();
  const { canPrompt, standalone, ios, install } = useInstall();
  const [pw, pwAction, pwPending] = useActionState(changePassword, undefined);
  const roles = ROLE_OPTIONS.includes(role) ? ROLE_OPTIONS : [...ROLE_OPTIONS, role];

  return (
    <Page className="max-w-[760px]">
      <PageHead eyebrow="Just for you" title="Settings"
        sub={<>You are signed in as {me.email ?? me.name} with <strong className="font-semibold text-ink-3">{me.access}</strong> access. {ws.scopeLabel(me) === "Every client" ? "You can see every client." : `You can see: ${ws.scopeLabel(me)}.`}</>}
      />

      <H2>Profile</H2>
      <Card className="mb-8 p-6">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void run(updateProfile, { name, role }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><input required className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
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
                <Field label="Current password" required><input name="current" type="password" autoComplete="current-password" className="field" required /></Field>
                <Field label="New password" required><input name="next" type="password" autoComplete="new-password" minLength={10} className="field" required /></Field>
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
        <div className="mb-1 text-[15px] font-semibold">Colour set</div>
        <p className="mb-3 mt-0 text-[14.5px] text-mute-2">The house colours for buttons, links and the highlight on where you are.</p>
        <div className="mb-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Colour set">
          {PALETTE_KEYS.map((k) => {
            const pal = PALETTES[k];
            const on = palette === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setPalette(k)}
                className={cx("flex items-center gap-3 rounded-lg border p-3 text-left transition", on ? "border-accent ring-2 ring-[color:var(--bos-hl)]" : "border-line hover:border-line-strong")}>
                <span className="flex h-11 w-16 flex-none overflow-hidden rounded-md">
                  <span className="flex-[3]" style={{ background: pal.accent }} /><span className="flex-[2]" style={{ background: pal.hl }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{pal.name}</span>
                  <span className="block text-[13.5px] text-mute-2">{pal.note}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mb-1 text-[15px] font-semibold">Inside a brand</div>
        <p className="mb-3 mt-0 text-[14.5px] text-mute-2">Keep the house blue everywhere, or let each brand&apos;s own colour take over its pages.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand colours">
          {([["off", "House blue everywhere"], ["moderate", "Brand colour for accents"], ["bold", "Brand colour and tinted pages"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
              className={cx("rounded-md border px-3.5 py-2 text-[14.5px]", mode === k ? "border-accent bg-soft font-semibold" : "border-line bg-white hover:border-mute-4")}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-divider pt-4">
          <span className="flex-1 text-[15px] text-mute-2">Keyboard shortcuts make the everyday things one key away.</span>
          <Btn onClick={() => open({ kind: "shortcuts" })}>Show shortcuts</Btn>
        </div>
      </Card>

      <H2>Notifications</H2>
      <EmailPrefsCard />
      <NotificationsCard last={!ws.can("access")} />
      {ws.can("access") && <SlackCard />}

      <H2>Calendar</H2>
      <CalendarFeedCard />

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

      {ws.can("export") && (
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

const noop = () => () => {};
type Perm = NotificationPermission | "unsupported";

/** Per-person email choices: instant, in the morning digest, or not at all. */
function EmailPrefsCard() {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const { mail, digest } = ws.d.notify;
  // Local copy so a click shows at once; the server copy arrives with the refresh.
  const [prefs, setPrefs] = useState(() => fullPrefs(ws.d.notify.prefs));
  const choose = (event: NotifyEvent, mode: NotifyMode) => {
    if (prefs[event] === mode) return;
    const before = prefs;
    setPrefs({ ...prefs, [event]: mode });
    void run(saveNotifyPrefs, { [event]: mode }).then((r) => { if (!r.ok) setPrefs(before); });
  };

  return (
    <Card className="mb-5 p-4 sm:p-6">
      <div className="mb-1 text-[15px] font-semibold">Email</div>
      <p className="m-0 mb-4 text-[15px] text-mute-1">
        Choose what BrandOS emails you about. <strong className="font-semibold text-ink-3">Instant</strong> sends it straight away;{" "}
        <strong className="font-semibold text-ink-3">Daily digest</strong> gathers it into one email each morning.
      </p>
      {!mail && (
        <Warn className="mb-4">Email is not set up for this workspace yet, so nothing is sent. An admin adds RESEND_API_KEY on the server. Your choices are kept for when it is.</Warn>
      )}
      {mail && !digest && (
        <Hint className="mb-4">The morning digest is not scheduled on this install (CRON_SECRET), so anything set to Daily digest is emailed straight away, and due-date reminders are not sent.</Hint>
      )}
      <div className="overflow-hidden rounded-[10px] border border-line">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Email notifications</caption>
          <thead className="bg-wash-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-[13px] font-semibold text-mute-2 sm:px-4">When</th>
              {NOTIFY_MODES.map((m) => (
                <th key={m.mode} scope="col" className="w-[56px] px-1 py-2 text-center text-[13px] font-semibold text-mute-2 sm:w-[104px]">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((e) => (
              <tr key={e.event} className="border-t border-divider">
                <th scope="row" className="px-3 py-3 align-top font-normal sm:px-4">
                  <span className="block text-[15px] font-medium text-ink-3">{e.label}</span>
                  <span className="block text-[13.5px] text-mute-2">{e.note}</span>
                </th>
                {NOTIFY_MODES.map((m) => {
                  const on = prefs[e.event] === m.mode;
                  return (
                    <td key={m.mode} className="px-1 py-3 text-center align-middle">
                      <input type="radio" name={`notify-${e.event}`} checked={on} disabled={pending && !on}
                        onChange={() => choose(e.event, m.mode)} aria-label={`${e.label}: ${m.label}`}
                        className="h-[18px] w-[18px] cursor-pointer accent-[var(--bos-accent)]" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 text-[14px] text-mute-3">
        Due-date reminders cover work you own or have to act on. Instant sends them as their own email each morning; Daily digest puts them in the digest.
      </p>
    </Card>
  );
}

/** Admins: the team Slack channel. */
function SlackCard() {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const on = ws.d.notify.slack;
  const test = async () => { const r = await run(sendSlackTest); if (r.ok) toast("Test message sent to Slack"); };
  return (
    <Card className="mb-8 flex flex-wrap items-center gap-4 p-6">
      <div className="min-w-[240px] flex-1">
        <div className="mb-1 text-[15px] font-semibold">Slack</div>
        <p className="m-0 text-[15px] text-mute-1">
          {on ? "Review requests, approvals, change requests and new client links are posted to your team's Slack channel, each with a link to the work."
            : "Slack is off. To post review requests, approvals, change requests and new client links to a channel, create a Slack incoming webhook and set SLACK_WEBHOOK_URL on the server."}
        </p>
      </div>
      {on ? <Btn disabled={pending} onClick={test}>Send test message</Btn>
        : <span className="rounded-full bg-chip px-3 py-1 text-[13.5px] font-semibold text-mute-2">Off</span>}
    </Card>
  );
}

/** Desktop notifications: opt in once per browser. */
function NotificationsCard({ last }: { last: boolean }) {
  const [, bump] = useState(0);
  const perm = useSyncExternalStore<Perm>(noop, () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission), () => "default");
  const ask = async () => { await Notification.requestPermission().catch(() => {}); bump((n) => n + 1); };
  return (
    <Card className={cx(last ? "mb-8" : "mb-5", "flex flex-wrap items-center gap-4 p-6")}>
      <div className="min-w-[240px] flex-1">
        <div className="mb-1 text-[15px] font-semibold">In the app</div>
        <p className="m-0 text-[15px] text-mute-1">The bell, the app icon and the tab title count what needs you: work sent to you for review or changes, and notes that @mention you. New ones pop up as they arrive.</p>
        <p className="m-0 mt-2 text-[14px] text-mute-3">
          {perm === "granted" ? "Desktop notifications are on for this browser. You will get one when BrandOS is in the background."
            : perm === "denied" ? "Desktop notifications are blocked. Allow them for this site in your browser settings."
            : perm === "unsupported" ? "This browser does not support desktop notifications."
            : "Turn on desktop notifications to hear about new work when BrandOS is in the background."}
        </p>
      </div>
      {perm === "default" && <Btn variant="primary" onClick={ask}>Turn on desktop notifications</Btn>}
      {perm === "granted" && <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[13.5px] font-semibold text-[#166534]">On</span>}
    </Card>
  );
}
