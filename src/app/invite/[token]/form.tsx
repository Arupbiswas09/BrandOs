"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/app/auth-actions";
import { FormError, Req } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Btn } from "@/components/ui";

export function InviteForm({ token, email, reset }: { token: string; email: string; reset?: boolean }) {
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <Req>Email</Req>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email ?? email} className="field text-lead" />
      </label>
      <label className="block">
        <Req>{reset ? "New password" : "Choose a password"}</Req>
        <PasswordInput name="password" autoComplete="new-password" minLength={10} required className="text-lead" autoFocus />
        <span className="mt-1.5 block text-meta text-mute-2">At least ten characters.</span>
      </label>
      {state?.error && <FormError>{state.error}</FormError>}
      <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Saving…" : reset ? "Save and sign in" : "Join the team"}</Btn>
    </form>
  );
}
