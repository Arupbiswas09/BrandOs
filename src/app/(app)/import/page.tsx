import type { Metadata } from "next";
import { ImportFlow } from "@/components/features/onboarding/import-flow";
import { Page, PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Import" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 64) : undefined);

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  const q = await searchParams;
  const kind = q.kind === "assets" ? "assets" : "offers";
  const mode = q.mode === "drive" ? "drive" : "sheet";
  return (
    <Page className="max-w-[920px]">
      <PageHead eyebrow="Import" title="Bring in offers and assets"
        sub="From a spreadsheet, or a list of Google Drive links. You see every row before anything is saved." />
      <ImportFlow brandId={one(q.brand)} kind={kind} mode={mode} offerId={one(q.offer)} />
    </Page>
  );
}
