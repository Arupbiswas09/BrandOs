import type { Metadata } from "next";
import { ServicePage } from "@/components/pages/service";
import { titleFor } from "@/server/titles";

export async function generateMetadata({ params }: PageProps<"/services/[id]">): Promise<Metadata> {
  return { title: await titleFor("service", (await params).id) };
}

export default async function Page({ params }: PageProps<"/services/[id]">) {
  const { id } = await params;
  return <ServicePage id={id} />;
}
