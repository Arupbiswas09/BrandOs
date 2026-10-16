// DEV PREVIEW — removed before release
import type { Metadata } from "next";
import { Preview } from "./preview";

export const metadata: Metadata = { title: "Stars and results (preview)" };

export default async function Page({ searchParams }: PageProps<"/dev/stars-results">) {
  const q = await searchParams;
  const offer = typeof q.offer === "string" ? q.offer : "of15";
  return <Preview offerId={offer} />;
}
