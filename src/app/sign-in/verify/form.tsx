"use client";

import { useActionState, useState } from "react";
import { verifySecondStep } from "@/app/auth-actions";
import { Req } from "@/components/auth-shell";

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
            className="field font-mono text-[17px] tracking-[0.08em]" />
        ) : (
          <input key="c" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\s*\d{3}\s*\d{3}\s*" maxLength={8} autoFocus placeholder="123 456"
            className="field font-mono text-[20px] tracking-[0.3em]" />
        )}
      </label>
      {state?.error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[15px] text-[#A63A12]">{state.error}</div>}
      {expired ? (
        <a href="/sign-in" className="rounded-[9px] bg-[#0F2A5F] px-4 py-3 text-center text-[15.5px] font-semibold text-white hover:brightness-110">Back to sign in</a>
      ) : (
        <button type="submit" disabled={pending} className="rounded-[9px] bg-[#0F2A5F] px-4 py-3 text-[15.5px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {pending ? "Checking…" : "Verify and sign in"}
        </button>
      )}
      <div className="flex items-center justify-between text-[14px]">
        <button type="button" onClick={() => setRecovery((v) => !v)} className="font-medium text-accent hover:underline">
          {recovery ? "Use a code from the app" : "Lost your phone? Use a recovery code"}
        </button>
        <a href="/sign-in" className="text-mute-2 hover:underline">Cancel</a>
      </div>
      <p className="m-0 text-center text-[13.5px] text-mute-2">No phone and no recovery codes? An admin can reset two-step verification for you from the Team page.</p>
    </form>
  );
}
