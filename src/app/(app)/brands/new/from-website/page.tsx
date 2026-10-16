import type { Metadata } from "next";
import { FromWebsite } from "@/components/features/onboarding/from-website";
import { Page, PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Brand from a website" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 2000) : undefined);

export default async function NewBrandFromWebsite({ searchParams }: PageProps<"/brands/new/from-website">) {
  const q = await searchParams;
  return (
    <Page className="max-w-[860px]">
      <PageHead eyebrow="New brand" title="Start a brand from its website"
        sub="Paste the address and get a draft kit to check: logo, colours, fonts, tagline and services." />
      <FromWebsite clientId={one(q.client)} initialUrl={one(q.url)} />
    </Page>
  );
}
