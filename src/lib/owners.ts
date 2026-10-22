import type { Brand, Group, User } from "@/db/schema";
import { can, scopeOf, seesBrand } from "./access";

/*
 * Who may own work, and who may delete a CTA. Pure, so the offer page's
 * owner picker, the Brand Kit's buttons and the server make the same
 * decision. The browser only uses this to choose what to offer; every
 * server action checks again.
 */

type Person = Pick<User, "id" | "access" | "allClients" | "clientIds" | "brandIds" | "groupIds"> & { permOverrides?: Partial<Record<string, boolean>> | null };
type ScopeBrand = Pick<Brand, "id" | "clientId" | "parentId">;
type ScopeGroup = Pick<Group, "id" | "clientIds" | "brandIds">;

/**
 * Someone who could own work on this brand: their role creates work (Admin,
 * Manager, Editor, Contributor, as changed for them in Team) and they can see
 * the brand's client or the brand itself.
 */
export function mayOwn(user: Person | null | undefined, brand: ScopeBrand | null | undefined, groups: ScopeGroup[]): boolean {
  if (!user || !brand) return false;
  return can(user, "edit") && seesBrand(scopeOf(user, groups), brand);
}

/** Everyone who could own work on this brand, by name. */
export function ownerChoices<U extends Person & { name: string }>(users: U[], brand: ScopeBrand | null | undefined, groups: ScopeGroup[]): U[] {
  return users.filter((u) => mayOwn(u, brand, groups)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Admins delete any CTA. Whoever made one deletes their own while they can
 * still create work. CTAs from before owners were kept have none, so they
 * stay admin-only.
 */
export function canDeleteCta(user: Pick<Person, "id" | "access" | "permOverrides"> | null | undefined, cta: { ownerId?: string | null } | null | undefined): boolean {
  if (!user || !cta) return false;
  if (can(user, "del")) return true;
  return !!cta.ownerId && cta.ownerId === user.id && can(user, "edit");
}
