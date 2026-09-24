import type { ReactNode } from "react";
import { HeroArt } from "@/components/art";

const POINTS = [
  ["Every brand in one place", "Clients, brands, offers and assets — with the Brand Kit right beside the work."],
  ["Clear roles and access", "Seven roles, from admin to client guest. Everyone sees only what they should."],
  ["Review without the chase", "Send for review, approve or ask for changes, with due dates that show up on the calendar."],
];

/** The split layout for sign-in, setup, invite and reset pages. */
export function AuthShell({ title, sub, children, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-[radial-gradient(120%_90%_at_10%_0%,#1D4ED8_0%,#0F2A5F_45%,#0B1B3A_100%)] px-12 py-12 text-white lg:flex lg:flex-col">
        <Brand light />
        <div className="my-auto">
          <HeroArt className="mx-auto w-full max-w-[460px]" />
          <h2 className="mb-6 mt-4 max-w-[22ch] text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">Your agency&apos;s brands, organised and on-brand.</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {POINTS.map(([h, p]) => (
              <li key={h} className="flex gap-3">
                <span aria-hidden className="mt-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#7DD3FC] text-[12px] font-bold text-[#0B1B3A]">✓</span>
                <span><span className="block text-[15.5px] font-semibold">{h}</span><span className="block text-[14.5px] leading-[1.5] text-[#BFDBFE]">{p}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 text-[13px] text-[#93C5FD]">© {new Date().getFullYear()} BrandOS · Developed by <span className="font-semibold text-white">Arup</span></p>
      </aside>
      <div className="flex items-start justify-center px-4 py-12 sm:px-8 sm:py-16 lg:items-center">
        <div className={`w-full animate-rise ${wide ? "max-w-[520px]" : "max-w-[440px]"}`}>
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="m-0 mb-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#0F172A]">{title}</h1>
          {sub && <p className="mb-7 mt-0 text-[15.5px] leading-[1.55] text-[#475569]">{sub}</p>}
          {children}
        </div>
      </div>
    </main>
  );
}

function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-[16px] font-bold ${light ? "bg-white text-[#0F2A5F]" : "bg-[#0F2A5F] text-white"}`}>B</span>
      <span className={`text-[18px] font-semibold tracking-[-0.015em] ${light ? "text-white" : "text-[#0F172A]"}`}>BrandOS</span>
    </div>
  );
}

/** "Continue with Google". A plain link: the route handler does the rest. */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <a href="/api/auth/google/start" className="flex w-full items-center justify-center gap-2.5 rounded-[9px] border border-[#CBD5E1] bg-white px-4 py-3 text-[15.5px] font-semibold text-[#0F172A] hover:border-[#94A3B8] hover:bg-[#F8FAFC]">
      <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
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
    <div className="my-5 flex items-center gap-3 text-[13.5px] text-[#64748B]" aria-hidden>
      <span className="h-px flex-1 bg-[#E2E8F0]" />or<span className="h-px flex-1 bg-[#E2E8F0]" />
    </div>
  );
}

/** Label text with the required asterisk. */
export function Req({ children }: { children: ReactNode }) {
  return <span className="label">{children}<span aria-hidden className="ml-0.5 text-[#DC2626]">*</span></span>;
}
