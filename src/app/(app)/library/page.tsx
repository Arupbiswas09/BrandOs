import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isGuest } from "@/lib/access";
import { requireViewer } from "@/server/session";
import { Library } from "@/components/pages/library";

export const metadata: Metadata = { title: "Global Library" };

export default async function Page() {
  // Client guests have no business in the internal pages.
  if (isGuest(await requireViewer())) redirect("/");
  return <Library />;
}
