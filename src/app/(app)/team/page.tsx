import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireViewer } from "@/server/session";
import { Team } from "@/components/pages/team";

export const metadata: Metadata = { title: "Team and access" };

export default async function Page() {
  // Who is on the team and what they may do is for admins only.
  if (!can(await requireViewer(), "access")) redirect("/");
  return <Team />;
}
