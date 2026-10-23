import type { ReactNode } from "react";
import type { Asset, Brand, FileRef } from "@/db/schema";
import { cmykText, onColor, rgbText, wcag } from "@/lib/color";
import { linkEmbed, linkParts, webUrl } from "@/lib/embeds";
import { GROUND_HEX, LEGAL_SLOTS, defaultScale, legalEntry, legalTitle, logoFiles, logoGround, socialHandle, socialName, variantLabel } from "@/lib/kit";

/*
 * The Brand Kit as a document: one long page that prints cleanly to PDF.
 * Rendered on the server. `assets` are the brand's assets the reader may
 * see; logo variations, guideline files and legal files come from them.
 * Sections with nothing in them are left out.
 */

const stack = (name: string, fallback?: string) => `"${name}", ${fallback || "system-ui, sans-serif"}`;
const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;
/** The address as it reads on paper: no https://, no www. */
const printed = (url: string) => { const u = webUrl(url); if (!u) return url; const { host, path } = linkParts(u); return host + path; };
const newest = (a: Asset | null | undefined): FileRef | null => [...(a?.files ?? [])].reverse().find((f) => f.key && f.url) ?? null;

export function GuidelinesDoc({ b, logoUrl, toolbar, assets = [] }: { b: Brand; logoUrl?: string | null; toolbar?: ReactNode; assets?: Asset[] }) {
  const k = b.kit ?? {};
  const logos = logoFiles(b, assets).map((l) => ({ ...l, src: l.asset.files.find((f) => f.key && IMAGE.test(f.type ?? "")) }));
  const showVariants = logos.some((l) => l.variant || l.src);
  const guideDocs = [
    ...assets.filter((a) => a.type === "Guidelines").flatMap((a) => a.files.filter((f) => f.url).map((f) => ({ name: f.name, sub: a.name, href: f.url! }))),
    ...(k.guideLinks ?? []).map((l) => ({ name: l.title || linkEmbed(l.url)?.provider || printed(l.url), sub: printed(l.url), href: l.url })),
  ];
  const legal = LEGAL_SLOTS.flatMap(({ slot }) => {
    const l = legalEntry(b, slot);
    if (!l) return [];
    if (l.url) return [{ name: legalTitle(l), sub: printed(l.url), href: l.url }];
    const f = newest(assets.find((a) => a.id === l.assetId));
    return f ? [{ name: legalTitle(l), sub: f.name, href: f.url! }] : [];
  });
  const social = k.social ?? [];
  const videos = k.videos ?? [];
  const scale = k.typeScale?.length ? k.typeScale : defaultScale(b);
  const families = [...new Set([...b.fonts.map((f) => f.name), ...scale.map((s) => s.font)])].filter(Boolean);
  const fontHref = families.length
    ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;
  const fg = onColor(b.primary);
  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  return (
    <div className="guidelines min-h-screen bg-[#EDF2F0] print:bg-surface">
      {fontHref && <link rel="stylesheet" href={fontHref} precedence="default" />}
      {toolbar && <div className="sticky top-0 z-10 border-b border-[#E1E7E4] bg-surface/90 px-5 py-3  print:hidden">{toolbar}</div>}
      <article className="mx-auto my-8 max-w-[900px] overflow-hidden rounded-2xl bg-surface shadow-card print:my-0 print:max-w-none print:rounded-none print:shadow-none">
        {/* cover */}
        <header className="flex min-h-[420px] flex-col justify-between p-10 sm:p-14 print:min-h-[96vh] print:break-after-page" style={{ background: b.primary, color: fg }}>
          <div className="flex items-center gap-3">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt="" className="h-12 max-w-[180px] rounded-lg bg-surface object-contain p-1.5" />
              : <span className="flex h-12 w-12 items-center justify-center rounded-xl text-lead font-bold" style={{ background: fg, color: b.primary }}>{b.mark}</span>}
            <span className="text-body font-semibold">{b.name}</span>
          </div>
          <div>
            <div className="mb-3 text-small font-semibold uppercase tracking-[0.14em]">Brand guidelines{k.version ? ` · v${k.version}` : ""}</div>
            <h1 className="display m-0 text-[56px] sm:text-[72px]">{b.name}</h1>
            {b.tagline && <p className="m-0 mt-3 max-w-[40ch] text-title leading-[1.4]">{b.tagline}</p>}
          </div>
        </header>

        <div className="px-10 py-12 sm:px-14 [&>section]:mb-14 [&>section]:break-inside-avoid-page">
          {!!(k.mission || k.values?.length || b.description) && (
            <Sec n={num()} title="Who we are">
              {k.mission && <p className="m-0 mb-4 max-w-[60ch] text-title leading-[1.45] text-[#101614]">{k.mission}</p>}
              {!k.mission && b.description && <p className="m-0 mb-4 max-w-[60ch] text-lead leading-[1.55] text-[#3E4A45]">{b.description}</p>}
              {!!k.values?.length && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {k.values.map((v, i) => <div key={v} className="rounded-xl border border-[#E1E7E4] p-4"><div className="mb-1 font-mono text-micro text-[#5E6C66]">0{i + 1}</div><div className="text-lead font-semibold">{v}</div></div>)}
                </div>
              )}
            </Sec>
          )}

          <Sec n={num()} title="Logo">
            <div className="grid grid-cols-3 gap-3">
              {[["#FFFFFF", "On white"], [b.primary, "On primary"], ["#101614", "On dark"]].map(([bg, label]) => (
                <div key={label}>
                  <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-[#E1E7E4]" style={{ background: bg }}>
                    {logoUrl && bg === "#FFFFFF"
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={logoUrl} alt="" className="max-h-[60%] max-w-[70%] object-contain" />
                      : <span className="flex h-12 w-12 items-center justify-center rounded-xl text-lead font-bold" style={bg === "#FFFFFF" ? { background: b.primary, color: fg } : { background: bg === b.primary ? fg : "#FFFFFF", color: bg === b.primary ? b.primary : "#101614" }}>{b.mark}</span>}
                  </div>
                  <div className="mt-1.5 text-center text-small text-[#5E6C66]">{label}</div>
                </div>
              ))}
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <Spec k="Clear space" v={k.logo?.clearSpace} />
              <Spec k="Minimum size, screen" v={k.logo?.minDigital} />
              <Spec k="Minimum size, print" v={k.logo?.minPrint} />
            </dl>
            {k.logo?.notes && <p className="mb-0 mt-4 text-body leading-[1.55] text-[#3E4A45]">{k.logo.notes}</p>}
            {!!k.logo?.misuse?.length && <Rules title="Never" items={k.logo.misuse} bad />}
            {showVariants && (
              <>
                <h3 className="mb-3 mt-6 text-small font-semibold uppercase tracking-[0.05em] text-[#5E6C66]">Variations</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-doc="logo-variations">
                  {logos.map(({ asset, variant, src }) => {
                    const ground = logoGround(variant);
                    return (
                      <div key={asset.id} className="break-inside-avoid">
                        <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-[#E1E7E4] p-4" style={{ background: GROUND_HEX[ground] }}>
                          {src
                            // eslint-disable-next-line @next/next/no-img-element -- a private, auth-checked file
                            ? <img src={`${src.url}?inline=1`} alt="" className="max-h-full max-w-full object-contain" />
                            : <span className="text-small font-semibold" style={{ color: ground === "dark" ? "#FFFFFF" : "#101614" }}>{b.mark}</span>}
                        </div>
                        <div className="mt-1.5 text-small"><span className="font-semibold">{variant ? variantLabel(variant) : "Logo"}</span><span className="text-[#5E6C66]"> · {asset.name}</span></div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Sec>

          {b.colours.length > 0 && (
            <Sec n={num()} title="Colour">
              <div className="grid gap-4 sm:grid-cols-2">
                {b.colours.map((c) => (
                  <div key={c.name + c.hex} className="flex overflow-hidden rounded-xl border border-[#E1E7E4]">
                    <div className="flex w-[120px] flex-none items-end p-3 text-small font-semibold" style={{ background: c.hex, color: onColor(c.hex) }}>{c.role ?? ""}</div>
                    <div className="min-w-0 flex-1 p-4">
                      <div className="text-lead font-semibold">{c.name}</div>
                      {c.usage && <div className="mb-2 text-meta text-[#46534D]">{c.usage}</div>}
                      <table className="w-full text-small">
                        <tbody>
                          {[["HEX", c.hex.toUpperCase()], ["RGB", rgbText(c.hex)], ["CMYK", c.cmyk || cmykText(c.hex) + "*"], ["Pantone", c.pantone || "Not set"]].map(([kk, v]) => (
                            <tr key={kk}><th scope="row" className="w-[70px] py-0.5 text-left font-semibold uppercase tracking-[0.05em] text-[#5E6C66]">{kk}</th><td className="py-0.5 font-mono text-[#101614]">{v}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 text-micro text-[#46534D]">Text on white {wcag(c.hex, "#FFFFFF").ratio.toFixed(1)}:1 · {wcag(c.hex, "#FFFFFF").grade}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mb-0 mt-3 text-micro text-[#5E6C66]">* CMYK worked out from the hex. Confirm against a printed proof.</p>
            </Sec>
          )}

          <Sec n={num()} title="Typography">
            <div className="grid gap-4 sm:grid-cols-2">
              {b.fonts.map((f) => (
                <div key={f.name + f.role} className="rounded-xl border border-[#E1E7E4] p-5">
                  <div className="text-[44px] leading-none" style={{ fontFamily: stack(f.name, f.fallback) }}>Aa</div>
                  <div className="mt-3 text-lead font-semibold">{f.name}</div>
                  <div className="text-meta text-[#46534D]">{[f.role, f.weights && `Weights ${f.weights}`, f.fallback && `Fallback ${f.fallback}`].filter(Boolean).join(" · ")}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 divide-y divide-[#E1E7E4] rounded-xl border border-[#E1E7E4]">
              {scale.map((t) => (
                <div key={t.name} className="flex items-baseline gap-5 px-5 py-3">
                  <div className="w-[140px] flex-none text-small text-[#5E6C66]"><div className="font-semibold text-[#101614]">{t.name}</div>{t.size}px / {t.lineHeight} · {t.weight}</div>
                  <div className="min-w-0 flex-1 truncate" style={{ fontFamily: stack(t.font), fontSize: Math.min(t.size, 52), fontWeight: t.weight, lineHeight: t.lineHeight, letterSpacing: t.tracking ? `${t.tracking}em` : undefined }}>{t.sample || (t.size >= 24 ? b.tagline || b.name : "The quick brown fox jumps over the lazy dog.")}</div>
                </div>
              ))}
            </div>
          </Sec>

          <Sec n={num()} title="Brand tone">
            {b.voice && <p className="m-0 mb-5 max-w-[60ch] text-lead leading-[1.5]">{b.voice}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {!!k.weAre?.length && <Rules title="We are" items={k.weAre} />}
              {!!k.weAreNot?.length && <Rules title="We are not" items={k.weAreNot} bad />}
              {!!k.wordsUse?.length && <Rules title="Words we use" items={k.wordsUse} />}
              {!!k.wordsAvoid?.length && <Rules title="Words we avoid" items={k.wordsAvoid} bad />}
            </div>
            {!!k.voiceExamples?.length && (
              <table className="mt-5 w-full border-collapse text-left text-meta">
                <thead><tr className="border-b border-[#E1E7E4] text-micro uppercase tracking-[0.05em] text-[#5E6C66]"><th className="py-2">Where</th><th className="py-2">Say this</th><th className="py-2">Not this</th></tr></thead>
                <tbody>{k.voiceExamples.map((e, i) => <tr key={i} className="border-b border-[#EDF2F0] align-top"><td className="py-2 pr-3 font-semibold">{e.context}</td><td className="py-2 pr-3 text-[#14532D]">{e.say}</td><td className="py-2 text-[#7F1D1D] line-through decoration-[#DC2626]/40">{e.dont}</td></tr>)}</tbody>
              </table>
            )}
            {b.boilerplate && <div className="mt-5 rounded-xl bg-[#F7F9F8] p-5"><div className="mb-1 text-micro font-semibold uppercase tracking-[0.05em] text-[#5E6C66]">Boilerplate</div><p className="m-0 text-body leading-[1.6]">{b.boilerplate}</p></div>}
          </Sec>

          {!!(k.imagery || k.imageryDo?.length || k.imageryDont?.length) && (
            <Sec n={num()} title="Imagery">
              {k.imagery && <p className="m-0 mb-4 max-w-[60ch] text-lead leading-[1.55]">{k.imagery}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                {!!k.imageryDo?.length && <Rules title="Look for" items={k.imageryDo} />}
                {!!k.imageryDont?.length && <Rules title="Avoid" items={k.imageryDont} bad />}
              </div>
            </Sec>
          )}

          {(!!k.dos?.length || !!k.donts?.length) && (
            <Sec n={num()} title="Do's and don'ts">
              <div className="grid gap-4 sm:grid-cols-2">
                {!!k.dos?.length && <Rules title="Do" items={k.dos} />}
                {!!k.donts?.length && <Rules title="Don't" items={k.donts} bad />}
              </div>
            </Sec>
          )}

          {videos.length > 0 && (
            <Sec n={num()} title="Videos">
              <Links items={videos.map((v) => ({ name: v.title || linkEmbed(v.url)?.provider || "Video", sub: [linkEmbed(v.url)?.provider, printed(v.url)].filter(Boolean).join(" · "), href: v.url }))} />
            </Sec>
          )}

          {social.length > 0 && (
            <Sec n={num()} title="Social links">
              <Links items={social.map((s) => ({ name: socialName(s), sub: socialHandle(s) === printed(s.url) ? printed(s.url) : `${socialHandle(s)} · ${printed(s.url)}`, href: s.url }))} />
            </Sec>
          )}

          {legal.length > 0 && (
            <Sec n={num()} title="Legal">
              <Links items={legal} />
            </Sec>
          )}

          {guideDocs.length > 0 && (
            <Sec n={num()} title="Guidelines documents">
              <Links items={guideDocs} />
            </Sec>
          )}
        </div>
        <footer className="border-t border-[#E1E7E4] px-10 py-6 text-small text-[#5E6C66] sm:px-14">{b.name} brand guidelines{k.version ? ` · v${k.version}` : ""} · Generated by BrandOS</footer>
      </article>
    </div>
  );
}

function Sec({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3 border-b border-[#101614] pb-2">
        <span className="font-mono text-small text-[#5E6C66]">{n}</span>
        <h2 className="m-0 text-heading font-semibold tracking-[-0.02em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Named links that still read on paper: the address is printed under each name. */
function Links({ items }: { items: { name: string; sub: string; href: string }[] }) {
  return (
    <ul className="m-0 list-none divide-y divide-[#E1E7E4] rounded-xl border border-[#E1E7E4] p-0">
      {items.map((x, i) => (
        <li key={`${x.href}-${i}`} className="break-inside-avoid px-5 py-3">
          <a href={x.href} className="text-body font-semibold text-[#101614] no-underline hover:underline">{x.name}</a>
          <div className="break-all font-mono text-small text-[#46534D]">{x.sub}</div>
        </li>
      ))}
    </ul>
  );
}

function Spec({ k, v }: { k: string; v?: string }) {
  return <div><dt className="text-micro font-semibold uppercase tracking-[0.05em] text-[#5E6C66]">{k}</dt><dd className="m-0 mt-0.5 text-body">{v || "Not set"}</dd></div>;
}

function Rules({ title, items, bad }: { title: string; items: string[]; bad?: boolean }) {
  return (
    <div className="mt-4 rounded-xl border p-4" style={{ borderColor: bad ? "#FECACA" : "#BBF7D0", background: bad ? "#FEF2F2" : "#F0FDF4" }}>
      <div className="mb-2 text-small font-semibold uppercase tracking-[0.05em]" style={{ color: bad ? "#B42318" : "#166534" }}>{bad ? "✕" : "✓"} {title}</div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body" style={{ color: bad ? "#7F1D1D" : "#14532D" }}>
        {items.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </div>
  );
}
