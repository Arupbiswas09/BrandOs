import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { requireViewer } from "@/server/session";
import { GuidelinesDoc } from "@/components/guidelines-doc";
import { PrintBar } from "@/components/print-bar";

export const metadata: Metadata = { title: "Brand guidelines", robots: { index: false, follow: false } };

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

export default async function Page({ params }: PageProps<"/guidelines/[brandId]">) {
  const { brandId } = await params;
  const me = await requireViewer();
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const b = all.brands.find((x) => x.id === brandId);
  if (!b || !vis.brand(b.id)) notFound();
  // Only what this person may see goes into the document: the brand's own assets, checked one by one.
  const assets = all.assets.filter((a) => a.brandId === b.id && !a.archived && vis.asset(a.id));
  const logo = assets.filter((a) => a.type === "Logo").flatMap((a) => a.files).find((f) => f.key && IMAGE.test(f.type ?? ""));
  return (
    <GuidelinesDoc b={b} assets={assets} logoUrl={logo ? `/api/files/${logo.key}?inline=1` : null}
      toolbar={<PrintBar title={`${b.name} · Brand guidelines`} back={{ href: `/brands/${b.id}/kit`, label: "Back to the Brand Kit" }} />} />
  );
}
