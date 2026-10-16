"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { IconBtn } from "@/components/ui";

/** A password field with a show/hide button. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={show ? "text" : "password"} className={`field pr-11 ${props.className ?? ""}`} />
      <IconBtn label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2">
        {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </IconBtn>
    </span>
  );
}
