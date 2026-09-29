import type { Metadata } from "next";
import { Calendar } from "@/components/pages/calendar";

export const metadata: Metadata = { title: "Launches" };

export default function Page() {
  return <Calendar />;
}
