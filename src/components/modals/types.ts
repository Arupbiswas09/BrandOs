import type { Asset, Brand, Client, Cta, Group, Offer, Service } from "@/db/schema";
import type { PublicUser } from "@/lib/types";

export type ItemKind = "offer" | "asset";
export type DeleteKind = "client" | "brand" | "service" | "offer" | "asset" | "cta" | "person" | "group";

export type AssetDraft = Partial<Asset> & { offerIds?: string[] };

export type ModalSpec =
  | { kind: "new" }
  | { kind: "client"; draft?: Partial<Client> }
  | { kind: "brand"; draft: Partial<Brand> & { clientId: string } }
  | { kind: "kit"; brandId: string }
  | { kind: "service"; draft: Partial<Service> & { brandId: string } }
  | { kind: "offer"; draft: Partial<Offer> & { brandId: string } }
  | { kind: "asset"; draft: AssetDraft; step?: 0 | 1 | 2 | 3 }
  | { kind: "clone"; srcId: string; brandId: string | null; name: string; offerIds: string[] }
  | { kind: "link"; offerId: string }
  | { kind: "linkAsset"; assetId: string }
  | { kind: "cta"; draft: Partial<Cta> & { brandId: string } }
  | { kind: "goal"; brandId: string; name?: string; description?: string; original?: string }
  | { kind: "mergeGoal"; brandId: string; from: string }
  | { kind: "goalOffers"; brandId: string; name: string }
  | { kind: "person"; draft?: Partial<PublicUser> }
  | { kind: "group"; draft?: Partial<Group> }
  | { kind: "sendReview"; item: ItemKind; id: string }
  | { kind: "reqChanges"; item: ItemKind; id: string }
  | { kind: "confirm"; item: DeleteKind; id: string; label: string; back?: string }
  | { kind: "shortcuts" };
