"use client";

import { useActionState, useState } from "react";
import { completeSetup } from "@/app/setup-actions";
import { BRAND_PALETTES } from "@/lib/constants";
import { onColor } from "@/lib/color";
import { Req } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";

export function SetupForm({ needsPassword }: { needsPassword: boolean }) {
  const [state, action, pending] = useActionState(completeSetup, undefined);
  const [color, setColor] = useState(BRAND_PALETTES[0][0]);
  return (
    <form action={action} className="flex flex-col gap-5 rounded-[14px] border border-line bg-white p-6 sm:p-7">
      <p className="m-0 -mb-2 text-[13px] text-mute-3"><span aria-hidden className="text-[#DC2626]">*</span> Required</p>
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-3 text-[17px] font-semibold">Your agency</legend>
        <label className="block"><Req>Agency name</Req><input name="agency" required className="field" placeholder="Quokka For Good" autoFocus /></label>
        <div>
          <span className="label">Its main colour</span>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_PALETTES.map(([c]) => (
              <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                className="h-9 w-9 rounded-lg border-2" style={{ background: c, borderColor: color === c ? "#0F172A" : "transparent" }} />
            ))}
            <input type="color" aria-label="Pick any colour" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded-lg border border-line bg-white p-0.5" />
          </div>
        </div>
      </fieldset>
      <hr className="m-0 border-0 border-t border-divider" />
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-3 text-[17px] font-semibold">You</legend>
        <label className="block"><Req>Your name</Req><input name="name" required autoComplete="name" className="field" /></label>
        <label className="block"><Req>Email</Req><input name="email" type="email" required autoComplete="email" className="field" /></label>
        {needsPassword && (
          <label className="block"><Req>Password</Req><PasswordInput name="password" required minLength={10} autoComplete="new-password" />
            <span className="mt-1.5 block text-[13px] text-mute-3">At least ten characters.</span></label>
        )}
      </fieldset>
      {state?.error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[14px] text-change-ink">{state.error}</div>}
      <button type="submit" disabled={pending} className="rounded-[9px] px-4 py-3 text-[15px] font-semibold hover:brightness-110 disabled:opacity-60" style={{ background: color, color: onColor(color) }}>
        {pending ? "Opening up…" : "Open BrandOS"}
      </button>
    </form>
  );
}
