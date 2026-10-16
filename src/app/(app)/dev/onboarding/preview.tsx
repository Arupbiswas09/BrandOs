// DEV PREVIEW — removed before release
"use client";

import Link from "next/link";
import { FromWebsite } from "@/components/features/onboarding/from-website";
import { ImportFlow } from "@/components/features/onboarding/import-flow";
import { ImportLink, StartFromExisting, useOnboardingMenuItems } from "@/components/features/onboarding/entry-points";
import { Card, Page, PageHead, Tabs } from "@/components/ui";

const TABS = [["website", "From a website"], ["import", "Spreadsheet import"], ["drive", "Drive links"], ["entry", "Entry points"]] as const;

export function OnboardingPreview({ tab }: { tab: (typeof TABS)[number][0] }) {
  const menu = useOnboardingMenuItems({ brandId: "br1", clientId: "cl1" });
  return (
    <Page className="max-w-[920px]">
      <PageHead eyebrow="Dev preview" title="Onboarding" sub="The onboarding pieces with the demo data, before they are mounted in the app."
        tabs={<Tabs items={TABS.map(([k, label]) => ({ key: k, label, href: `/dev/onboarding?tab=${k}`, active: tab === k }))} />} />
      {tab === "website" && <FromWebsite clientId="cl1" />}
      {tab === "import" && <ImportFlow brandId="br1" kind="offers" />}
      {tab === "drive" && <ImportFlow brandId="br1" mode="drive" offerId="of1" />}
      {tab === "entry" && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="eyebrow mb-3">&quot;+ New&quot; menu entries (inside Quokka For Good)</div>
            <ul className="m-0 list-none space-y-1 p-0">
              {menu.map((m) => (
                <li key={m.key}>
                  <Link href={m.href} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-hover">
                    <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-line text-mute-2"><m.icon aria-hidden className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-body font-medium text-ink">{m.label}</span>
                      <span className="block truncate text-small text-mute-2">{m.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <span className="text-body text-ink-3">A brand&apos;s Offers tab header, with the quiet link</span>
            <ImportLink brandId="br1" kind="offers" />
          </Card>
          <div>
            <div className="eyebrow mb-3">Empty dashboard</div>
            <StartFromExisting />
          </div>
        </div>
      )}
    </Page>
  );
}
