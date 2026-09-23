"use client";

import { useActionState } from "react";
import { requestReset } from "@/app/auth-actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  if (state?.email === "sent") {
    return (
      <div role="status" className="rounded-[14px] border border-line bg-white p-6 text-[15px] leading-[1.55] text-ink-3">
        If that address has an account, a link is on its way. It works for one hour. Check your spam folder if it has not arrived in a few minutes.
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-6">
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field" autoFocus />
      </label>
      {state?.error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[14px] text-change-ink">{state.error}</div>}
      <button type="submit" disabled={pending} className="rounded-[9px] bg-[#2D4A5C] px-4 py-2.5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}
