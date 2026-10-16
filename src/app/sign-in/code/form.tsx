"use client";

import { useActionState, useEffect, useRef } from "react";
import { codeSignIn, type CodeState } from "@/app/auth-actions";
import { FormError, Req } from "@/components/auth-shell";
import { Btn } from "@/components/ui";

/** Step one asks for the email; once a code is on its way, step two asks for the code. */
export function CodeForm() {
  const [state, action, pending] = useActionState<CodeState, FormData>(codeSignIn, undefined);
  const email = state?.email ?? "";
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state?.sent) codeRef.current?.focus(); }, [state]);

  if (!state?.sent) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="send" />
        <label className="block">
          <Req>Email</Req>
          <input name="email" type="email" autoComplete="email" required defaultValue={email} className="field text-lead" autoFocus placeholder="you@agency.com" />
        </label>
        {state?.error && <FormError>{state.error}</FormError>}
        <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Sending…" : "Email me a code"}</Btn>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="rounded-xl border border-line bg-wash-2 px-3.5 py-3 text-body leading-[1.5] text-ink-3">
        If <strong className="font-semibold text-ink">{email}</strong> is on the team, a code is on its way. It can take a minute; check spam if it does not arrive.
      </div>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="email" value={email} />
        <label className="block">
          <Req>Six-digit code</Req>
          <input ref={codeRef} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required
            className="field text-center font-mono text-title tracking-[0.3em]" placeholder="000000" />
        </label>
        {state.error && <FormError>{state.error}</FormError>}
        <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Checking…" : "Sign in"}</Btn>
      </form>
      <form action={action} className="flex flex-wrap items-center justify-between gap-2 text-meta">
        <input type="hidden" name="intent" value="send" />
        <input type="hidden" name="email" value={email} />
        <Btn type="submit" variant="link" disabled={pending}>Send a new code</Btn>
        <a href="/sign-in/code" className="font-medium text-mute-2 hover:text-ink hover:underline">Use a different email</a>
      </form>
    </div>
  );
}
