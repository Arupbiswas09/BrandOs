"use client";

import { useActionState, useTransition } from "react";
import { hexA, readable } from "@/lib/color";
import { ACCESS_COLOR, ACCESS_NOTE } from "@/lib/constants";
import type { Access } from "@/db/schema";
import { signInAs } from "@/app/actions";
import { signInWithPassword } from "@/app/auth-actions";
import { FormError, Req } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Btn } from "@/components/ui";

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
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition-[border-color,box-shadow,transform] duration-150 ease-snap hover:border-line-strong hover:shadow-raise enabled:active:scale-[0.98] disabled:opacity-60"
          title={ACCESS_NOTE[p.access]}
        >
          <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-full bg-avatar font-mono text-meta font-bold text-mute-1">{p.initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold">{p.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="flex-none rounded-sm px-1.5 py-px text-micro font-semibold" style={{ background: hexA(ACCESS_COLOR[p.access], 0.12), color: readable(ACCESS_COLOR[p.access], 0.12) }}>{p.access}</span>
              <span className="truncate text-small text-mute-2">{p.role}</span>
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
      {state?.error && <FormError>{state.error}</FormError>}
      <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Btn>
      <p className="m-0 text-center text-meta text-mute-2">No account yet? Ask an admin to invite you.</p>
    </form>
  );
}
