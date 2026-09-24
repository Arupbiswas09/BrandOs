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

/** Label text with the required asterisk. */
export function Req({ children }: { children: ReactNode }) {
  return <span className="label">{children}<span aria-hidden className="ml-0.5 text-[#DC2626]">*</span></span>;
}
