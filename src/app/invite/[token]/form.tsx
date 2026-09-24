"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/app/auth-actions";
import { Req } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";

export function InviteForm({ token, email, reset }: { token: string; email: string; reset?: boolean }) {
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <Req>Email</Req>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email ?? email} className="field text-[16px]" />
      </label>
      <label className="block">
        <Req>{reset ? "New password" : "Choose a password"}</Req>
        <PasswordInput name="password" autoComplete="new-password" minLength={10} required className="text-[16px]" autoFocus />
        <span className="mt-1.5 block text-[14px] text-[#526077]">At least ten characters.</span>
      </label>
      {state?.error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[15px] text-[#A63A12]">{state.error}</div>}
      <button type="submit" disabled={pending} className="rounded-[9px] bg-[#0F2A5F] px-4 py-2.5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Saving…" : reset ? "Save and sign in" : "Join the team"}
      </button>
    </form>
  );
}
