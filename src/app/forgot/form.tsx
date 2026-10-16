"use client";

import { useActionState } from "react";
import { requestReset } from "@/app/auth-actions";
import { FormError, Req } from "@/components/auth-shell";
import { Btn } from "@/components/ui";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  if (state?.email === "sent") {
    return (
      <div role="status" className="rounded-xl border border-line bg-surface p-6 text-body leading-[1.55] text-ink-3">
        If that address has an account, a link is on its way. It works for one hour. Check your spam folder if it has not arrived in a few minutes.
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="block">
        <Req>Email</Req>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field" autoFocus />
      </label>
      {state?.error && <FormError>{state.error}</FormError>}
      <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Sending…" : "Send me a link"}</Btn>
    </form>
  );
}
