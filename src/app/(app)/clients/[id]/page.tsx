import type { Metadata } from "next";
import { ClientPage } from "@/components/pages/client";
import { titleFor } from "@/server/titles";

export async function generateMetadata({ params }: PageProps<"/clients/[id]">): Promise<Metadata> {
  return { title: await titleFor("client", (await params).id) };
}

export default async function Page({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  return <ClientPage id={id} />;
}
