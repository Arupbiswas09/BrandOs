"use client";

import { Btn } from "@/components/ui";

export function RetryButton() {
  return <Btn variant="primary" size="lg" onClick={() => location.reload()}>Try again</Btn>;
}
