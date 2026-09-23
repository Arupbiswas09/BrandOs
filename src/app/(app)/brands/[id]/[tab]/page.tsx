import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandPage } from "@/components/pages/brand";
import { BRAND_TABS, type BrandTab } from "@/lib/routes";
import { titleFor } from "@/server/titles";

export async function generateMetadata({ params }: PageProps<"/brands/[id]/[tab]">): Promise<Metadata> {
  const { id, tab } = await params;
  const label = BRAND_TABS.find(([k]) => k === tab)?.[1];
  return { title: `${label ?? "Brand"} · ${await titleFor("brand", id)}` };
}

export default async function Page({ params, searchParams }: PageProps<"/brands/[id]/[tab]">) {
  const { id, tab } = await params;
  if (!BRAND_TABS.some(([k]) => k === tab) || tab === "home") notFound();
  const type = (await searchParams).type;
  return <BrandPage id={id} tab={tab as BrandTab} type={typeof type === "string" ? type : undefined} />;
}
