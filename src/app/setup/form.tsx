"use client";

import { useActionState, useState } from "react";
import { completeSetup } from "@/app/setup-actions";
import { BRAND_PALETTES } from "@/lib/constants";
import { onColor } from "@/lib/color";

export function SetupForm({ needsPassword }: { needsPassword: boolean }) {
  const [state, action, pending] = useActionState(completeSetup, undefined);
  const [color, setColor] = useState(BRAND_PALETTES[0][0]);
  return (
    <form action={action} className="flex flex-col gap-5 rounded-[14px] border border-line bg-white p-6 sm:p-7">
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-3 text-[17px] font-semibold">Your agency</legend>
        <label className="block"><span className="label">Agency name</span><input name="agency" required className="field" placeholder="Quokka For Good" autoFocus /></label>
        <div>
          <span className="label">Its main colour</span>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_PALETTES.map(([c]) => (
              <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                className="h-9 w-9 rounded-lg border-2" style={{ background: c, borderColor: color === c ? "#101614" : "transparent" }} />
            ))}
            <input type="color" aria-label="Pick any colour" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded-lg border border-line bg-white p-0.5" />
          </div>
        </div>
      </fieldset>
      <hr className="m-0 border-0 border-t border-divider" />
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-3 text-[17px] font-semibold">You</legend>
        <label className="block"><span className="label">Your name</span><input name="name" required autoComplete="name" className="field" /></label>
        <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="field" /></label>
        {needsPassword && (
          <label className="block"><span className="label">Password</span><input name="password" type="password" required minLength={10} autoComplete="new-password" className="field" />
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
