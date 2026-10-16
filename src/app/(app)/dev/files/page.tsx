// DEV PREVIEW — removed before release
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isGuest } from "@/lib/access";
import { requireViewer } from "@/server/session";
import { FilesPreview } from "./preview";

export const metadata: Metadata = { title: "Files preview" };

/** Bulk upload, file versions and previews, mounted with real data so they can be tried before they go into the pages. */
export default async function Page() {
  if (isGuest(await requireViewer())) redirect("/");
  return <FilesPreview />;
}
