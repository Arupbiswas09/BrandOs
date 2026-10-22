import { parsePath } from "@/lib/routes";
import type { WS } from "@/lib/ws";

/**
 * Where the person is: the brand they are inside (a brand page, or one of its
 * services or offers), and where new work would go from here. Search narrows
 * to `active`; the New menu files new work under `brand`.
 */
export function whereAmI(ws: WS, pathname: string) {
  const p = parsePath(pathname);
  const active =
    p.view === "brand" ? ws.brand(p.id) :
    p.view === "offer" ? ws.brand(ws.offer(p.id)?.brandId) :
    p.view === "service" ? ws.brand(ws.service(p.id)?.brandId) : null;
  // On a client's page, new work goes to that client's own brand rather than the first brand in the workspace.
  const clientBrand = p.view === "client" ? ws.d.brands.find((x) => x.clientId === p.id && !x.archived && !x.parentId) ?? ws.d.brands.find((x) => x.clientId === p.id && !x.archived) : null;
  return {
    active,
    brand: active ?? clientBrand ?? ws.d.brands.find((x) => !x.archived) ?? null,
    offer: p.view === "offer" ? ws.offer(p.id) : null,
    service: p.view === "service" ? ws.service(p.id) : null,
    clientId: active?.clientId ?? (p.view === "client" ? p.id : undefined) ?? ws.d.clients.find((c) => !c.archived)?.id,
  };
}
