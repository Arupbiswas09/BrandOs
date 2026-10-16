// DEV PREVIEW — removed before release
"use client";

import { checkLinkNow } from "@/app/link-actions";
import { useApp } from "@/components/app/provider";
import { Btn, Card, Page, SectionHead } from "@/components/ui";
import { BrokenLinksCard, CheckBrandLinksButton } from "@/components/features/links/broken-links-card";
import { LinkStatus } from "@/components/features/links/link-status";
import { PagePictureButton } from "@/components/features/links/page-picture-button";
import { useRun } from "@/components/features/links/use-run";
import { TrackedLinksButton, UtmBuilder } from "@/components/features/links/utm-builder";
import { linkCheckOf } from "@/lib/link-health";

/** Every component of the links feature, mounted on real workspace data. */
export function LinksPreview() {
  const { ws, toast } = useApp();
  const [run, pending] = useRun();
  const withLinks = ws.d.assets.filter((a) => !a.archived && a.url.trim()).sort((x, y) => x.name.localeCompare(y.name));
  const offer = ws.offer("of15");
  const asset = ws.asset("as1");
  const cta = ws.cta("ct1");

  return (
    <Page>
      <SectionHead as="h1" eyebrow="Dev preview" title="Links" sub="Broken-link checks, page pictures and tracked links, on the seed data." />

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section aria-label="Dashboard card">
          <h2 className="eyebrow mb-2">BrokenLinksCard (dashboard)</h2>
          <BrokenLinksCard />
          <p className="m-0 text-meta text-mute-2">Renders nothing while every link opens.</p>
        </section>
        <section aria-label="Brand card">
          <h2 className="eyebrow mb-2">BrokenLinksCard brandId=&quot;br1&quot;</h2>
          <BrokenLinksCard brandId="br1" />
          <CheckBrandLinksButton brandId="br1" />
        </section>
      </div>

      <h2 className="eyebrow mb-2">Assets with a link</h2>
      <ul className="m-0 mb-10 flex list-none flex-col gap-3 p-0">
        {withLinks.map((a) => {
          const c = linkCheckOf(a);
          const preview = ws.previewOf(a);
          return (
            <li key={a.id}>
              <Card className="p-4">
                <section aria-label={a.name} className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-start gap-3">
                    {preview
                      // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file
                      ? <img src={preview} alt="" className="h-14 w-20 flex-none rounded-lg border border-line object-cover" data-testid="thumb" />
                      : <span className="flex h-14 w-20 flex-none items-center justify-center rounded-lg border border-dashed border-line-strong font-mono text-micro text-mute-2">No picture</span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-semibold">{a.name}</span>
                        <LinkStatus asset={a} variant="badge" />
                      </div>
                      <div className="truncate font-mono text-small text-mute-2">{a.type} · {a.url}</div>
                      <div className="font-mono text-micro text-mute-2" data-testid="check">{c ? `${c.ok ? "ok" : "broken"} ${c.status ?? ""} ${c.error ?? ""}`.trim() : "never checked"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Btn size="sm" variant="ghost" disabled={pending} onClick={async () => {
                        const r = await run(() => checkLinkNow(a.id));
                        if (r) toast(r.check.ok ? "Link opens" : `Not responding (${r.check.status ?? r.check.error})`, "info");
                      }}>Check now</Btn>
                      <PagePictureButton asset={a} />
                      <TrackedLinksButton url={a.url} asset={a} offer={ws.linkedOffers(a.id)[0]} />
                    </div>
                  </div>
                  <LinkStatus asset={a} />
                </section>
              </Card>
            </li>
          );
        })}
      </ul>

      <h2 className="eyebrow mb-2">UtmBuilder: {offer?.name} · {cta?.text}</h2>
      <Card className="mb-10 max-w-[720px] p-5">
        <UtmBuilder url={cta?.url ?? "quokkaforgood.org/audit"} offer={offer} asset={asset} cta={cta} />
      </Card>
    </Page>
  );
}
