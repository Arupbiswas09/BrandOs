// DEV PREVIEW — removed before release
import type { Metadata } from "next";
import { OnboardingPreview } from "./preview";

export const metadata: Metadata = { title: "Onboarding preview" };

export default async function DevOnboarding({ searchParams }: PageProps<"/dev/onboarding">) {
  const q = await searchParams;
  const tab = q.tab === "import" || q.tab === "drive" || q.tab === "entry" ? q.tab : "website";
  return <OnboardingPreview tab={tab} />;
}
