"use client";

import { useActionState, useTransition } from "react";
import { hexA, readable } from "@/lib/color";
import { ACCESS_COLOR, ACCESS_NOTE } from "@/lib/constants";
import type { Access } from "@/db/schema";
import { signInAs } from "@/app/actions";
import { signInWithPassword } from "@/app/auth-actions";

type Person = { id: string; name: string; initials: string; role: string; access: Access };

export function DemoPicker({ people }: { people: Person[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E1E7E4] bg-white">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await signInAs(p.id); })}
          className="flex w-full items-center gap-3 border-t border-[#F0F4F2] px-5 py-3.5 text-left first:border-t-0 hover:bg-[#F7F9F8] disabled:opacity-60"
          title={ACCESS_NOTE[p.access]}
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#EDF2F0] font-mono text-[13.5px] font-bold text-[#4F5D57]">{p.initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{p.name}</span>
            <span className="block text-[14.5px] text-[#5C6A64]">{p.role}</span>
          </span>
          <span className="flex-none rounded-[5px] px-2 py-[3px] font-mono text-[13px] font-bold" style={{ background: hexA(ACCESS_COLOR[p.access], 0.14), color: readable(ACCESS_COLOR[p.access]) }}>{p.access}</span>
        </button>
      ))}
    </div>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(signInWithPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] border border-[#E1E7E4] bg-white p-6">
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field text-[16px]" autoFocus />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="field text-[16px]" />
      </label>
      {state?.error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[15px] text-[#A63A12]">{state.error}</div>}
      <button type="submit" disabled={pending} className="rounded-[9px] bg-[#2D4A5C] px-4 py-2.5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="m-0 flex flex-wrap justify-between gap-2 text-[14px] text-mute-2"><a href="/forgot" className="text-accent hover:underline">Forgot your password?</a><span>No account? Ask an admin to invite you.</span></p>
    </form>
  );
}
