"use client";

import { useActionState, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { ROLE_OPTIONS } from "@/lib/constants";
import { saveNotifyPrefs, sendSlackTest, updateProfile } from "@/app/actions";
import type { NotifyEvent, NotifyMode } from "@/db/schema";
import { NOTIFY_EVENTS, NOTIFY_MODES, fullPrefs } from "@/lib/notify";
import { CalendarFeedCard } from "@/components/calendar-feed";
import { changePassword, sendTestEmail } from "@/app/auth-actions";
import { useAction, useApp } from "@/components/app/provider";
import { useInstall } from "@/components/app/pwa";
import { usePalette, useTakeover } from "@/components/app/shell";
import { PALETTES, PALETTE_KEYS } from "@/components/app/theme";
import { Sections, SectionsHead, SectionTitle, type SectionItem } from "@/components/section-tabs";
import { PasswordInput } from "@/components/password-input";
import { Btn, Card, Field, Hint, Page, Select, Warn, cx } from "@/components/ui";
import { UploadLimits } from "./limits";
import { SessionsCard, TwoFactorCard, TwoFactorNudge, type SecurityInfo } from "./security";

type Sec = "profile" | "appearance" | "notifications" | "security" | "calendar" | "workspace" | "uploads";

/** `security` is null in demo mode, where there is nothing to protect. */
export function Settings({ security }: { security: SecurityInfo | null }) {
  const { ws } = useApp();
  const params = useSearchParams();
  const admin = ws.can("access");
  const canExport = ws.can("export");
  const items: SectionItem<Sec>[] = [
    { key: "profile", label: "Profile", group: "Your account" },
    { key: "appearance", label: "Appearance", group: "Your account" },
    { key: "notifications", label: "Notifications", group: "Your account" },
    ...(security ? [{ key: "security" as const, label: "Security", group: "Your account" }] : []),
    { key: "calendar", label: "Calendar", group: "Your account" },
    ...(admin || canExport ? [{ key: "workspace" as const, label: "Slack and export", group: "Workspace" }] : []),
    ...(ws.d.uploads.admin ? [{ key: "uploads" as const, label: "Upload limits", group: "Workspace" }] : []),
  ];
  const asked = params.get("section");
  const active = items.find((x) => x.key === asked)?.key ?? "profile";
  // The open section is in the address (?section=calendar), so it can be linked to and survives a reload.
  const go = (k: Sec) => window.history.replaceState(null, "", `?section=${k}`);
  const nudge = !!security && !security.twoFactor && (ws.me.access === "Admin" || ws.me.access === "Manager");

  return (
    <Page className="max-w-[1040px]">
      <SectionsHead at="lg" eyebrow="Just for you" title="Settings" />
      <Sections at="lg" idBase="settings" label="Settings sections" items={items} active={active} onChange={go}>
        {active === "profile" && <Profile nudge={nudge} onSecurity={() => go("security")} />}
        {active === "appearance" && <Appearance />}
        {active === "notifications" && (
          <>
            <SectionTitle title="Notifications" sub="What BrandOS tells you about, and where." />
            <EmailPrefsCard />
            <NotificationsCard />
          </>
        )}
        {active === "security" && security && (
          <>
            <SectionTitle title="Security" sub="Your password, two-step verification and the devices you are signed in on." />
            <PasswordCard hasPassword={security.hasPassword} />
            <TwoFactorCard info={security} />
            <SessionsCard info={security} />
          </>
        )}
        {active === "calendar" && (
          <>
            <SectionTitle title="Calendar" sub="Offer launch dates in the calendar you already use." />
            <CalendarFeedCard className="mb-0" />
          </>
        )}
        {active === "workspace" && (
          <>
            <SectionTitle title="Slack and export" sub="Settings for the whole workspace. Only admins see these." />
            {admin && <SlackCard />}
            {canExport && <ExportCard />}
          </>
        )}
        {active === "uploads" && (
          <>
            <SectionTitle title="Upload limits" sub="What people may upload, how big each file can be, and how much space they get." />
            <UploadLimits />
          </>
        )}
      </Sections>
    </Page>
  );
}

/* ---------------------------------------------------------------- shared */

/** A row in a settings card: what it is on the left, its control on the right. */
function Row({ title, children, control, className }: { title: ReactNode; children?: ReactNode; control?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-divider px-5 py-4 first:border-t-0", className)}>
      <div className="min-w-[220px] flex-1">
        <h3 className="m-0 text-body font-semibold text-ink">{title}</h3>
        {children && <div className="mt-0.5 text-meta leading-[1.5] text-mute-2 text-pretty">{children}</div>}
      </div>
      {control && <div className="flex flex-none flex-wrap items-center gap-2">{control}</div>}
    </div>
  );
}

/** "On" / "Off" next to a setting: the word carries it, the colour only helps. */
function State({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className={cx("rounded-full bg-chip px-2.5 py-0.5 text-small font-semibold", on ? "text-ok" : "text-mute-2")}>{children}</span>;
}

/* ---------------------------------------------------------------- profile */

function Profile({ nudge, onSecurity }: { nudge: boolean; onSecurity: () => void }) {
  const { ws, open, toast } = useApp();
  const me = ws.me;
  const [run, pending] = useAction();
  const [name, setName] = useState(me.name);
  const [role, setRole] = useState(me.role);
  // Said out loud, like every other save in Settings: the button only greys out, which is easy to miss.
  const save = async () => { const r = await run(updateProfile, { name, role }); if (r.ok) toast("Profile saved"); };
  const { canPrompt, standalone, ios, install } = useInstall();
  const roles = ROLE_OPTIONS.includes(role) ? ROLE_OPTIONS : [...ROLE_OPTIONS, role];
  const scope = ws.scopeLabel(me);

  return (
    <>
      <SectionTitle title="Profile" sub="How you appear to the team." />
      {nudge && <TwoFactorNudge onSetUp={onSecurity} />}
      <Card className="p-5">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><input required className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
            <Field label="What you do"><Select value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: r }))} /></Field>
          </div>
          <div><Btn type="submit" variant="primary" disabled={pending || (name === me.name && role === me.role)}>Save profile</Btn></div>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <dl className="m-0">
          {[
            ["Signed in as", me.email ?? me.name],
            ["Access", me.access],
            ["You can see", scope === "Every client" ? "Every client" : scope],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-6 gap-y-0.5 border-t border-divider px-5 py-3 first:border-t-0">
              <dt className="w-32 flex-none text-meta font-semibold text-mute-1">{k}</dt>
              <dd className="m-0 min-w-0 flex-1 text-meta text-ink-3">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <Row title="App"
          control={!standalone && (canPrompt ? <Btn onClick={() => install()}>Install the app</Btn> : <Btn onClick={() => open({ kind: "install" })}>How to install</Btn>)}>
          {standalone ? "You are using the installed app. It updates itself whenever the team ships a change."
            : `Install BrandOS on this ${ios ? "iPhone or iPad" : "computer or phone"}. It opens in its own window and loads faster.`}
        </Row>
        <Row title="Keyboard shortcuts" control={<Btn onClick={() => open({ kind: "shortcuts" })}>Show shortcuts</Btn>}>
          The everyday things, one key away. Press ? anywhere to see them.
        </Row>
      </Card>
    </>
  );
}

/* ---------------------------------------------------------------- appearance */

/** A radio group of buttons with the arrow keys the pattern expects. */
function useRadioKeys<T extends string>(keys: readonly T[], value: T, set: (v: T) => void) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: KeyboardEvent, k: T) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = keys[(keys.indexOf(k) + step + keys.length) % keys.length];
    set(next);
    refs.current[next]?.focus();
  };
  return (k: T) => ({
    ref: (el: HTMLButtonElement | null) => { refs.current[k] = el; },
    role: "radio" as const, "aria-checked": value === k, tabIndex: value === k ? 0 : -1,
    onClick: () => set(k), onKeyDown: (e: KeyboardEvent) => onKeyDown(e, k),
  });
}

const STRENGTHS = [
  ["off", "House colour everywhere", "Brands look like the rest of BrandOS."],
  ["moderate", "Brand colour for accents", "Buttons and links take the brand's colour."],
  ["bold", "Brand colour and tinted pages", "The whole page takes on the brand."],
] as const;
const STRENGTH_KEYS = STRENGTHS.map(([k]) => k);

function Appearance() {
  const [mode, setMode] = useTakeover();
  const [palette, setPalette] = usePalette();
  const pal = useRadioKeys(PALETTE_KEYS, palette, setPalette);
  const strength = useRadioKeys(STRENGTH_KEYS, mode, setMode);
  return (
    <>
      <SectionTitle title="Appearance" sub="Colours for this browser. Nobody else sees your choice." />
      <Card className="p-5">
        <h3 id="colour-set" className="m-0 text-body font-semibold">Colour set</h3>
        <p className="mb-3 mt-0.5 text-meta text-mute-2">The house colours for buttons, links and the highlight on where you are.</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-labelledby="colour-set">
          {PALETTE_KEYS.map((k) => {
            const p = PALETTES[k];
            const on = palette === k;
            return (
              <button key={k} type="button" {...pal(k)}
                className={cx("flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors duration-150", on ? "border-accent bg-soft" : "border-line bg-surface hover:border-line-strong hover:bg-wash")}>
                <span aria-hidden className="flex h-9 w-12 flex-none overflow-hidden rounded-md">
                  <span className="flex-[3]" style={{ background: p.accent }} /><span className="flex-[2]" style={{ background: p.hl }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-semibold">{p.name}</span>
                  <span className="block text-small text-mute-2">{p.note}</span>
                </span>
              </button>
            );
          })}
        </div>

        <h3 id="brand-strength" className="m-0 mt-6 border-t border-divider pt-5 text-body font-semibold">Inside a brand</h3>
        <p className="mb-3 mt-0.5 text-meta text-mute-2">How much each brand&apos;s own colour takes over its pages.</p>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="brand-strength">
          {STRENGTHS.map(([k, label, note]) => {
            const on = mode === k;
            return (
              <button key={k} type="button" {...strength(k)}
                className={cx("rounded-lg border px-3 py-2.5 text-left transition-colors duration-150", on ? "border-accent bg-soft" : "border-line bg-surface hover:border-line-strong hover:bg-wash")}>
                <span className="block text-body font-semibold">{label}</span>
                <span className="block text-small text-mute-2">{note}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/* ---------------------------------------------------------------- security */

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [pw, pwAction, pwPending] = useActionState(changePassword, undefined);
  return (
    <Card className="mb-4 p-5">
      <form action={pwAction} className="flex flex-col gap-4">
        <div>
          <h3 className="m-0 text-body font-semibold">Password</h3>
          {!hasPassword && <p className="m-0 mt-0.5 text-meta text-mute-2">You sign in with Google. Add a password too if you want another way in.</p>}
        </div>
        {/* The same show/hide field as signing in, so a long password can be checked before it is saved. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {hasPassword && <Field label="Current password" required><PasswordInput name="current" autoComplete="current-password" required /></Field>}
          <Field label="New password" required>
            <PasswordInput name="next" autoComplete="new-password" minLength={10} required />
            <span className="mt-1.5 block text-small text-mute-3">At least ten characters.</span>
          </Field>
        </div>
        {pw?.error && <div role="alert" className="text-body text-change-ink">{pw.error}</div>}
        {pw?.email === "saved" && <div role="status" className="text-body text-ok">Password saved. Your other devices were signed out.</div>}
        <div><Btn type="submit" disabled={pwPending}>{hasPassword ? "Change password" : "Set a password"}</Btn></div>
      </form>
    </Card>
  );
}

/* ---------------------------------------------------------------- notifications */

/** Admins prove the email settings work by sending themselves one. */
function TestEmail() {
  const { ws, toast } = useApp();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const send = () => start(async () => {
    const r = await sendTestEmail();
    if (r.ok) { setResult(null); toast(`Test email sent to ${r.to}`); }
    else setResult(r.error);
  });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-wash px-3.5 py-2.5">
      <span className="min-w-[200px] flex-1 text-meta text-mute-1">Email is on. Send yourself one to check it arrives{ws.me.email ? ` at ${ws.me.email}` : ""}.</span>
      <Btn size="sm" disabled={pending} onClick={send}>{pending ? "Sending…" : "Send a test email"}</Btn>
      {result && <div role="alert" className="w-full text-meta font-medium text-danger">The mail server said: {result}</div>}
    </div>
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
    <Card className="mb-4 p-5">
      <h3 className="m-0 text-body font-semibold">Email</h3>
      <p className="m-0 mb-4 mt-0.5 text-meta text-mute-2">
        <strong className="font-semibold text-ink-3">Instant</strong> sends it straight away;{" "}
        <strong className="font-semibold text-ink-3">Daily digest</strong> gathers it into one email each morning.
      </p>
      {/* Email is switched on in the server's settings, not here, so an admin is told where rather than to ask an admin. */}
      {!mail && (
        <Warn className="mb-4">
          {ws.can("access")
            ? "Email is not set up on the server yet, so nothing is sent. It is switched on where BrandOS is hosted, not here: ask whoever runs the server to add the email settings. Your choices are kept for when it is."
            : "Email is not set up on the server yet, so nothing is sent. An admin can switch it on. Your choices are kept for when it is."}
        </Warn>
      )}
      {mail && ws.can("access") && <TestEmail />}
      {mail && !digest && (
        <Hint className="mb-4">The morning digest is not scheduled on this server yet, so anything set to Daily digest is emailed straight away.</Hint>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Email notifications</caption>
          <thead className="bg-wash-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-small font-semibold text-mute-2 sm:px-4">When</th>
              {NOTIFY_MODES.map((m) => (
                <th key={m.mode} scope="col" className="w-14 px-1 py-2 text-center text-small font-semibold text-mute-2 sm:w-26">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((e) => (
              <tr key={e.event} className="border-t border-divider">
                <th scope="row" className="px-3 py-2.5 align-top font-normal sm:px-4">
                  <span className="block text-body font-medium text-ink-3">{e.label}</span>
                  <span className="block text-meta text-mute-2">{e.note}</span>
                </th>
                {NOTIFY_MODES.map((m) => {
                  const on = prefs[e.event] === m.mode;
                  return (
                    <td key={m.mode} className="px-1 py-2.5 text-center align-middle">
                      <input type="radio" name={`notify-${e.event}`} checked={on} disabled={pending && !on}
                        onChange={() => choose(e.event, m.mode)} aria-label={`${e.label}: ${m.label}`}
                        className="size-5 cursor-pointer accent-[var(--bos-accent)]" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Desktop notifications: opt in once per browser. */
function NotificationsCard() {
  const [, bump] = useState(0);
  const perm = useSyncExternalStore<Perm>(noop, () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission), () => "default");
  const ask = async () => { await Notification.requestPermission().catch(() => {}); bump((n) => n + 1); };
  return (
    <Card className="overflow-hidden">
      <Row title="In the app"
        control={perm === "default" ? <Btn onClick={ask}>Turn on desktop notifications</Btn> : perm === "granted" ? <State on>On</State> : null}>
        <p className="m-0">Your queue in the sidebar, the app icon and the tab title count what needs you: work sent to you for review or changes, and notes that @mention you.</p>
        <p className="m-0 mt-1.5">
          {perm === "granted" ? "Desktop notifications are on for this browser, so you hear about new work when BrandOS is in the background."
            : perm === "denied" ? "Desktop notifications are blocked. Allow them for this site in your browser settings."
            : perm === "unsupported" ? "This browser does not support desktop notifications."
            : "Turn on desktop notifications to hear about new work when BrandOS is in the background."}
        </p>
      </Row>
    </Card>
  );
}

/* ---------------------------------------------------------------- workspace */

/** Admins: the team Slack channel. */
function SlackCard() {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const on = ws.d.notify.slack;
  const test = async () => { const r = await run(sendSlackTest); if (r.ok) toast("Test message sent to Slack"); };
  return (
    <Card className="mb-4 overflow-hidden">
      <Row title={<span className="inline-flex items-center gap-2">Slack <State on={on}>{on ? "On" : "Off"}</State></span>}
        control={on && <Btn disabled={pending} onClick={test}>Send test message</Btn>}>
        {on ? "Review requests, approvals and change requests are posted to your team's Slack channel, each with a link to the work."
          : "Slack is not connected on the server yet. It is connected where BrandOS is hosted, not here: ask whoever runs the server to add your channel's Slack webhook. Then review requests, approvals and change requests are posted to it."}
      </Row>
    </Card>
  );
}

function ExportCard() {
  return (
    <Card className="overflow-hidden">
      <Row title="Workspace data"
        control={<a href="/api/export" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-body font-medium text-ink-3 transition-[background-color,border-color,transform] duration-150 ease-snap hover:border-line-strong hover:bg-wash active:scale-[0.97]"><Download aria-hidden className="h-4 w-4" />Export JSON</a>}>
        Download everything (clients, brands, offers, assets, discussion and activity) as one JSON file. Uploaded files are not included.
      </Row>
    </Card>
  );
}
