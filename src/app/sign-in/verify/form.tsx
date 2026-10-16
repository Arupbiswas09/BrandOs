"use client";

import { useActionState, useState } from "react";
import { verifySecondStep } from "@/app/auth-actions";
import { FormError, Req } from "@/components/auth-shell";
import { LinkBtn } from "@/components/link-btn";
import { Btn } from "@/components/ui";

export function CodeForm() {
  const [state, action, pending] = useActionState(verifySecondStep, undefined);
  const [recovery, setRecovery] = useState(false);
  const expired = state?.email === "expired";
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="block">
        <Req>{recovery ? "Recovery code" : "Code"}</Req>
        {recovery ? (
          <input key="r" name="code" required autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus placeholder="xxxxx-xxxxx"
            className="field font-mono text-lead tracking-[0.08em]" />
        ) : (
          <input key="c" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\s*\d{3}\s*\d{3}\s*" maxLength={8} autoFocus placeholder="123 456"
            className="field font-mono text-title tracking-[0.3em]" />
        )}
      </label>
      {state?.error && <FormError>{state.error}</FormError>}
      {expired ? (
        <LinkBtn href="/sign-in" variant="primary" size="lg" className="w-full">Back to sign in</LinkBtn>
      ) : (
        <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Checking…" : "Verify and sign in"}</Btn>
      )}
      <div className="flex items-center justify-between text-meta">
        <Btn variant="link" onClick={() => setRecovery((v) => !v)}>{recovery ? "Use a code from the app" : "Lost your phone? Use a recovery code"}</Btn>
        <a href="/sign-in" className="text-mute-2 hover:underline">Cancel</a>
      </div>
      <p className="m-0 text-center text-meta text-mute-2">No phone and no recovery codes? An admin can reset two-step verification for you from the Team page.</p>
    </form>
  );
}
