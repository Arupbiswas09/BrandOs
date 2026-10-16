// DEV PREVIEW — removed before release
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinksPreview } from "./preview";

export const metadata: Metadata = { title: "Links preview" };

export default function Page() {
  if (process.env.NODE_ENV === "production" && process.env.BRANDOS_DEV_PREVIEWS !== "1") notFound();
  return <LinksPreview />;
}
