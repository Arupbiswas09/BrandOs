import type { Metadata } from "next";
import { OfferPage } from "@/components/pages/offer";
import { titleFor } from "@/server/titles";

export async function generateMetadata({ params }: PageProps<"/offers/[id]">): Promise<Metadata> {
  return { title: await titleFor("offer", (await params).id) };
}

export default async function Page({ params }: PageProps<"/offers/[id]">) {
  const { id } = await params;
  return <OfferPage id={id} />;
}
