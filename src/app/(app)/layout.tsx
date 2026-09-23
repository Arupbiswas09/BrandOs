import { Suspense } from "react";
import { buildWorkspace } from "@/server/data";
import { authMode, requireViewer, viewerExtras } from "@/server/session";
import { WorkspaceProvider } from "@/components/app/provider";
import { AppShell } from "@/components/app/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireViewer();
  const extras = await viewerExtras(me.id);
  const data = await buildWorkspace(me.id, { ...extras, authMode: authMode() });
  return (
    <Suspense>
      <WorkspaceProvider data={data}>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </Suspense>
  );
}
