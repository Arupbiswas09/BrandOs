import type { Metadata } from "next";
import { BrandPage } from "@/components/pages/brand";
import { titleFor } from "@/server/titles";

export async function generateMetadata({ params }: PageProps<"/brands/[id]">): Promise<Metadata> {
  return { title: await titleFor("brand", (await params).id) };
}

export default async function Page({ params }: PageProps<"/brands/[id]">) {
  const { id } = await params;
  return <BrandPage id={id} tab="home" />;
}
