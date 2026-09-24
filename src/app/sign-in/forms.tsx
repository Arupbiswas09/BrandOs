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
          className="flex w-full items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-3 text-left transition hover:-translate-y-px hover:border-[#93C5FD] hover:shadow-[0_6px_16px_rgba(15,42,95,.08)] disabled:opacity-60"
          title={ACCESS_NOTE[p.access]}
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#EEF2F7] font-mono text-[13.5px] font-bold text-[#475569]">{p.initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{p.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="flex-none rounded-[5px] px-1.5 py-px text-[12px] font-semibold" style={{ background: hexA(ACCESS_COLOR[p.access], 0.12), color: readable(ACCESS_COLOR[p.access], 0.12) }}>{p.access}</span>
              <span className="truncate text-[13px] text-[#4B5A6E]">{p.role}</span>
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
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field text-[16px]" autoFocus placeholder="you@agency.com" />
      </label>
      <label className="block">
        <span className="flex items-baseline justify-between"><Req>Password</Req><a href="/forgot" className="text-[13.5px] font-medium text-accent hover:underline">Forgot it?</a></span>
        <PasswordInput name="password" autoComplete="current-password" required className="text-[16px]" />
      </label>
      {state?.error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[15px] text-[#A63A12]">{state.error}</div>}
      <button type="submit" disabled={pending} className="rounded-[9px] bg-[#0F2A5F] px-4 py-3 text-[15.5px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="m-0 text-center text-[14px] text-mute-2">No account yet? Ask an admin to invite you.</p>
    </form>
  );
}
