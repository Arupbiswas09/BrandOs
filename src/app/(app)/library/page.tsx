import type { Metadata } from "next";
import { Library } from "@/components/pages/library";

export const metadata: Metadata = { title: "Global Library" };

export default function Page() {
  return <Library />;
}
