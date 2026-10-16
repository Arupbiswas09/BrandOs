"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { completeSetup } from "@/app/setup-actions";
import { BRAND_PALETTES } from "@/lib/constants";
import { onColor } from "@/lib/color";
import { FormError, Req } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Btn, cx } from "@/components/ui";

export function SetupForm({ needsPassword }: { needsPassword: boolean }) {
  const [state, action, pending] = useActionState(completeSetup, undefined);
  const [color, setColor] = useState(BRAND_PALETTES[0][0]);
  // The chosen colour previews on the button, as the agency's colour will across its own brand.
  const preview = { "--bos-accent": color, "--bos-on": onColor(color) } as CSSProperties;
  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6 sm:p-7">
      <p className="m-0 -mb-2 text-small text-mute-3"><span aria-hidden>*</span> Required</p>
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-3 text-lead font-semibold">Your agency</legend>
        <label className="block"><Req>Agency name</Req><input name="agency" required className="field" placeholder="Quokka For Good" autoFocus /></label>
        <div>
          <span className="label">Its main colour</span>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_PALETTES.map(([c]) => (
              <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                className={cx("size-9 rounded-lg border-2", color === c ? "border-ink" : "border-transparent")} style={{ background: c }} />
            ))}
            <input type="color" aria-label="Pick any colour" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded-lg border border-line bg-surface p-0.5" />
          </div>
        </div>
      </fieldset>
      <hr className="m-0 border-0 border-t border-divider" />
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-3 text-lead font-semibold">You</legend>
        <label className="block"><Req>Your name</Req><input name="name" required autoComplete="name" className="field" /></label>
        <label className="block"><Req>Email</Req><input name="email" type="email" required autoComplete="email" className="field" /></label>
        {needsPassword && (
          <label className="block"><Req>Password</Req><PasswordInput name="password" required minLength={10} autoComplete="new-password" />
            <span className="mt-1.5 block text-small text-mute-3">At least ten characters.</span></label>
        )}
      </fieldset>
      {state?.error && <FormError>{state.error}</FormError>}
      <Btn type="submit" variant="primary" size="lg" disabled={pending} className="w-full" style={preview}>{pending ? "Opening up…" : "Open BrandOS"}</Btn>
    </form>
  );
}
