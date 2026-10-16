import type { ReactNode } from "react";

const POINTS = [
  ["Every brand in one place", "Clients, brands, offers and assets, with the Brand Kit right beside the work."],
  ["Clear roles and access", "Six roles, from admin to viewer. Everyone sees only the clients they work on."],
  ["Review without the chase", "Send for review, approve or ask for changes, and see what has waited too long."],
];

/** The split layout for sign-in, setup, invite and reset pages. */
export function AuthShell({ title, sub, children, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-accent px-12 py-12 text-on-accent lg:flex lg:flex-col">
        <Brand light />
        <div className="my-auto">
          <h2 className="mb-6 mt-0 max-w-[22ch] text-display font-semibold leading-[1.15] tracking-[-0.02em]">Your agency&apos;s brands, organised and on-brand.</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {POINTS.map(([h, p]) => (
              <li key={h} className="flex gap-3">
                <span aria-hidden className="mt-1 flex size-5 flex-none items-center justify-center rounded-full bg-white/15 text-micro font-bold">✓</span>
                <span><span className="block text-body font-semibold">{h}</span><span className="block text-body leading-[1.5] text-white/80">{p}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 text-small text-white/75">© {new Date().getFullYear()} BrandOS · Developed by <span className="font-semibold text-white">Arup</span></p>
      </aside>
      <div className="flex items-start justify-center px-4 py-12 sm:px-8 sm:py-16 lg:items-center">
        <div className={`w-full ${wide ? "max-w-[520px]" : "max-w-[440px]"}`}>
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="display m-0 mb-2 text-display text-ink">{title}</h1>
          {sub && <p className="mb-7 mt-0 text-body leading-[1.55] text-mute-1">{sub}</p>}
          {children}
        </div>
      </div>
    </main>
  );
}

function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className={`flex size-9 items-center justify-center rounded-lg text-lead font-bold ${light ? "bg-surface text-accent" : "bg-accent text-on-accent"}`}>B</span>
      <span className={`text-lead font-semibold tracking-[-0.015em] ${light ? "text-white" : "text-ink"}`}>BrandOS</span>
    </div>
  );
}

/** "Continue with Google". A plain link: the route handler does the rest. Looks like a large secondary Btn. */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <a href="/api/auth/google/start" className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface px-4 text-body font-semibold text-ink transition-[background-color,border-color,transform] duration-150 ease-snap hover:bg-wash active:scale-[0.97]">
      <svg aria-hidden viewBox="0 0 48 48" className="size-5">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {label}
    </a>
  );
}

/** A thin rule with "or" in the middle. */
export function OrRule() {
  return (
    <div className="my-5 flex items-center gap-3 text-meta text-mute-2" aria-hidden>
      <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Label text with the required asterisk (quiet grey: required is not an error). */
export function Req({ children }: { children: ReactNode }) {
  return <span className="label">{children}<span aria-hidden className="ml-0.5 text-mute-3">*</span></span>;
}

/** What went wrong with a sign-in form, said plainly. */
export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  return <div role="alert" className={`rounded-lg bg-change/10 px-3 py-2 text-body text-change-ink ${className ?? ""}`}>{children}</div>;
}
