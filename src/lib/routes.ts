export type BrandTab = "home" | "services" | "offers" | "assets" | "kit" | "ctas";

export const BRAND_TABS: [BrandTab, string][] = [
  ["home", "Home"],
  ["services", "Services"],
  ["offers", "Offers"],
  ["assets", "Assets"],
  ["kit", "Brand Kit"],
  ["ctas", "CTAs"],
];

export const href = {
  street: () => "/",
  library: () => "/library",
  team: () => "/team",
  client: (id: string) => `/clients/${id}`,
  brand: (id: string, tab: BrandTab = "home") => (tab === "home" ? `/brands/${id}` : `/brands/${id}/${tab}`),
  service: (id: string) => `/services/${id}`,
  offer: (id: string) => `/offers/${id}`,
};

/** Which brand (if any) the current path belongs to, before looking up offers or services. */
export function parsePath(pathname: string): { view: string; id?: string; tab?: BrandTab } {
  const [, a, b, c] = pathname.split("/");
  if (!a) return { view: "street" };
  if (a === "brands" && b) return { view: "brand", id: b, tab: (c as BrandTab) || "home" };
  if (a === "clients" && b) return { view: "client", id: b };
  if (a === "offers" && b) return { view: "offer", id: b };
  if (a === "services" && b) return { view: "service", id: b };
  return { view: a };
}
