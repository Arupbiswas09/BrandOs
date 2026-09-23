import "server-only";
import { loadAll, makeVisibility, scopeFor } from "./data";
import { getViewer } from "./session";

/** Tab titles that never leak the name of something the viewer cannot see. */
export async function titleFor(kind: "client" | "brand" | "service" | "offer", id: string): Promise<string> {
  const me = await getViewer();
  if (!me) return "BrandOS";
  const all = await loadAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  switch (kind) {
    case "client": return vis.client(id) ? all.clients.find((x) => x.id === id)?.name ?? "Client" : "Client";
    case "brand": return vis.brand(id) ? all.brands.find((x) => x.id === id)?.name ?? "Brand" : "Brand";
    case "service": return vis.service(id) ? all.services.find((x) => x.id === id)?.name ?? "Service" : "Service";
    case "offer": return vis.offer(id) ? all.offers.find((x) => x.id === id)?.name ?? "Offer" : "Offer";
  }
}
