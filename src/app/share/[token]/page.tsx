import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema as s } from "@/db";
import { hexA, onColor } from "@/lib/color";
import { loadShare } from "@/server/share";

export const metadata: Metadata = { title: "Shared assets", robots: { index: false, follow: false } };

export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const data = await loadShare(token);
  if (!data) notFound();
  const { brand: b, assets, ctas } = data;

  after(async () => {
    const db = await getDb();
    await db.update(s.shareLinks).set({ views: sql`${s.shareLinks.views} + 1`, lastViewedAt: new Date() }).where(eq(s.shareLinks.token, token));
  });

  const fg = onColor(b.primary);
  return (
    <main className="min-h-screen" style={{ background: hexA(b.primary, 0.04) }}>
      <header className="px-5 pb-10 pt-14 sm:px-8" style={{ background: `linear-gradient(180deg, ${hexA(b.primary, 0.12)}, transparent)` }}>
        <div className="mx-auto max-w-[860px]">
          <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[14px] text-[19px] font-bold" style={{ background: b.primary, color: fg }}>{b.mark}</span>
          <h1 className="m-0 mb-2 font-serif text-[36px] font-normal leading-[1.1] tracking-[-0.02em] sm:text-[42px]">{b.name}</h1>
          <p className="m-0 max-w-[52ch] text-[16px] leading-[1.5] text-[#4F5D57]">{b.tagline}</p>
          <p className="mt-4 text-[15px] text-[#566560]">{assets.length} item{assets.length === 1 ? "" : "s"} ready for you. The team has cleared everything here to send.</p>
        </div>
      </header>

      <div className="px-5 pb-20 sm:px-8"><div className="mx-auto flex max-w-[860px] flex-col gap-4">
        {assets.map((a) => {
          const cta = ctas.find((c) => c.id === a.ctaId);
          const files = a.files.filter((f) => f.key);
          return (
            <article key={a.id} className="rounded-2xl border border-[#E1E7E4] bg-white p-6">
              <div className="mb-1 font-mono text-[12.5px] font-bold uppercase tracking-[0.12em] text-[#62706A]">{a.type}</div>
              <h2 className="m-0 text-[20px] font-semibold tracking-[-0.015em]">{a.name}</h2>
              {a.short && <p className="m-0 mt-1 text-[15px] text-[#566560]">{a.short}</p>}
              {a.copy && (a.copy.headline || a.copy.body) && (
                <div className="mt-5 rounded-xl bg-[#FAFBFB] p-5">
                  {a.copy.headline && <div className="mb-2 text-[18px] font-semibold leading-[1.4]">{a.copy.headline}</div>}
                  {a.copy.body && <div className="whitespace-pre-wrap text-[15px] leading-[1.65] text-[#3E4A45]">{a.copy.body}</div>}
                  {(cta || a.copy.cta) && (
                    <span className="mt-4 inline-block rounded-[7px] px-4 py-2 text-[15px] font-semibold"
                      style={cta ? { background: cta.style === "solid" ? cta.bg : "transparent", color: cta.fg, border: `1.5px solid ${cta.style === "outline" ? cta.fg : "transparent"}` } : { background: b.primary, color: fg }}>
                      {cta?.text ?? a.copy.cta}
                    </span>
                  )}
                </div>
              )}
              {(a.url || a.specs) && (
                <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
                  {a.url && <div><dt className="text-[13.5px] text-[#62706A]">Where it lives</dt><dd className="m-0 break-all"><a className="underline" style={{ color: b.primary }} href={a.url.startsWith("http") ? a.url : `https://${a.url}`} target="_blank" rel="noreferrer">{a.url}</a></dd></div>}
                  {a.specs && <div><dt className="text-[13.5px] text-[#62706A]">Specs</dt><dd className="m-0 text-[#3E4A45]">{a.specs}</dd></div>}
                </dl>
              )}
              {files.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 border-t border-[#F0F4F2] pt-4">
                  {files.map((f) => (
                    <a key={f.key} href={`/api/share/${token}/${f.key}`} className="flex items-center gap-3 rounded-lg px-1 py-1 text-[15px] hover:bg-[#F7F9F8]">
                      <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                      <span className="font-mono text-[14px] text-[#64716B]">{f.size}</span>
                      <span className="text-[14.5px] font-semibold" style={{ color: b.primary }}>Download</span>
                    </a>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {!assets.length && <div className="rounded-2xl border border-dashed border-[#AFBDB7] p-10 text-center text-[15px] text-[#566560]">Nothing has been shared here yet.</div>}

        {b.colours.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-[15px] font-semibold">Brand colours</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {b.colours.map((c) => (
                <div key={c.hex + c.name} className="overflow-hidden rounded-xl border border-[#E1E7E4] bg-white">
                  <div className="flex h-16 items-end p-2.5 text-[14px] font-semibold" style={{ background: c.hex, color: onColor(c.hex) }}>{c.hex}</div>
                  <div className="px-3 py-2 text-[14.5px] font-semibold">{c.name}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        <footer className="mt-10 text-center text-[14px] text-[#68756F]">Shared privately through BrandOS. Please do not forward this link.</footer>
      </div></div>
    </main>
  );
}
