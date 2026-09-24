import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadShare } from "@/server/share";
import { GuidelinesDoc } from "@/components/guidelines-doc";
import { PrintBar } from "@/components/print-bar";

export const metadata: Metadata = { title: "Brand guidelines", robots: { index: false, follow: false } };

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

/** The Brand Kit for someone holding a client share link. Logos only when cleared to send. */
export default async function Page({ params }: PageProps<"/share/[token]/guidelines">) {
  const { token } = await params;
  const data = await loadShare(token);
  if (!data) notFound();
  const logo = data.assets.filter((a) => a.type === "Logo").flatMap((a) => a.files).find((f) => f.key && IMAGE.test(f.type ?? ""));
  return (
    <GuidelinesDoc b={data.brand} logoUrl={logo ? `/api/share/${token}/${logo.key}?inline=1` : null}
      toolbar={<PrintBar title={`${data.brand.name} · Brand guidelines`} back={{ href: `/share/${token}`, label: "Shared files" }} />} />
  );
}
