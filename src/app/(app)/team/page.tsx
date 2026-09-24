import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isGuest } from "@/lib/access";
import { requireViewer } from "@/server/session";
import { Team } from "@/components/pages/team";

export const metadata: Metadata = { title: "Team and access" };

export default async function Page() {
  // Client guests have no business in the internal pages.
  if (isGuest(await requireViewer())) redirect("/");
  return <Team />;
}
