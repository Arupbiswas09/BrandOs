"use client";

import { useActionState, useTransition } from "react";
import { hexA, readable } from "@/lib/color";
import { ACCESS_COLOR, ACCESS_NOTE } from "@/lib/constants";
import type { Access } from "@/db/schema";
import { signInAs } from "@/app/actions";
import { signInWithPassword } from "@/app/auth-actions";
import { Req } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";

type Person = { id: string; name: string; initials: string; role: string; access: Access };

export function DemoPicker({ people }: { people: Person[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await signInAs(p.id); })}
          className="flex w-full items-center gap-3 rounded-xl border border-[#E1E7E4] bg-surface px-3.5 py-3 text-left transition hover:-translate-y-px hover:border-[#7BA0A8] hover:shadow-card disabled:opacity-60"
          title={ACCESS_NOTE[p.access]}
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#EDF2F0] font-mono text-meta font-bold text-[#46534D]">{p.initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold">{p.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="flex-none rounded-sm px-1.5 py-px text-micro font-semibold" style={{ background: hexA(ACCESS_COLOR[p.access], 0.12), color: readable(ACCESS_COLOR[p.access], 0.12) }}>{p.access}</span>
              <span className="truncate text-small text-[#56645E]">{p.role}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(signInWithPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="block">
        <Req>Email</Req>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field text-lead" autoFocus placeholder="you@agency.com" />
      </label>
      <label className="block">
        <span className="flex items-baseline justify-between"><Req>Password</Req><a href="/forgot" className="text-meta font-medium text-accent hover:underline">Forgot it?</a></span>
        <PasswordInput name="password" autoComplete="current-password" required className="text-lead" />
      </label>
      {state?.error && <div role="alert" className="rounded-lg bg-[rgba(194,65,18,.07)] px-3 py-2 text-body text-[#A63A12]">{state.error}</div>}
      <button type="submit" disabled={pending} className="rounded-lg bg-[#2D4A5C] px-4 py-3 text-body font-semibold text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="m-0 text-center text-meta text-mute-2">No account yet? Ask an admin to invite you.</p>
    </form>
  );
}
