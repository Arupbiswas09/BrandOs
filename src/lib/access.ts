import type { Access, Brand, Group, User } from "@/db/schema";

/*
 * Two things decide what a person gets: what they are allowed to do (access
 * level) and which clients they can see (scope). Everything else follows.
 * This module is pure so the server and the browser make identical decisions.
 */

export type Perm = "edit" | "archive" | "del" | "review" | "comment" | "access";

export const PERMISSIONS: Record<Access, Record<Perm, boolean>> = {
  Admin: { edit: true, archive: true, del: true, review: true, comment: true, access: true },
  Editor: { edit: true, archive: true, del: false, review: true, comment: true, access: false },
  Reviewer: { edit: false, archive: false, del: false, review: true, comment: true, access: false },
  Viewer: { edit: false, archive: false, del: false, review: false, comment: false, access: false },
};

type ScopeUser = Pick<User, "access" | "allClients" | "clientIds" | "brandIds" | "groupIds">;
type ScopeBrand = Pick<Brand, "id" | "clientId" | "parentId">;

export function can(user: Pick<User, "access"> | null | undefined, perm: Perm): boolean {
  if (!user) return false;
  return !!PERMISSIONS[user.access ?? "Viewer"]?.[perm];
}

export type Scope = { all: boolean; clients: Set<string>; brands: Set<string> };

export function scopeOf(user: ScopeUser, groups: Pick<Group, "id" | "clientIds" | "brandIds">[]): Scope {
  if (user.allClients) return { all: true, clients: new Set(), brands: new Set() };
  const clients = new Set(user.clientIds ?? []);
  const brands = new Set(user.brandIds ?? []);
  for (const gid of user.groupIds ?? []) {
    const g = groups.find((x) => x.id === gid);
    if (!g) continue;
    g.clientIds.forEach((c) => clients.add(c));
    g.brandIds.forEach((b) => brands.add(b));
  }
  return { all: false, clients, brands };
}

export function seesBrand(scope: Scope, brand: ScopeBrand | null | undefined): boolean {
  if (!brand) return false;
  if (scope.all) return true;
  if (scope.brands.has(brand.id)) return true;
  if (scope.clients.has(brand.clientId)) return true;
  return !!(brand.parentId && scope.brands.has(brand.parentId));
}

export function seesClient(scope: Scope, clientId: string, brands: ScopeBrand[]): boolean {
  if (scope.all) return true;
  if (scope.clients.has(clientId)) return true;
  return brands.some((b) => b.clientId === clientId && scope.brands.has(b.id));
}

export function scopeLabel(
  user: ScopeUser,
  lookup: { group: (id: string) => { name: string } | undefined; client: (id: string) => { name: string } | undefined; brand: (id: string) => { name: string } | undefined },
): string {
  if (user.allClients) return "Every client";
  const parts = [
    ...(user.groupIds ?? []).map((g) => lookup.group(g)?.name),
    ...(user.clientIds ?? []).map((c) => lookup.client(c)?.name),
    ...(user.brandIds ?? []).map((b) => lookup.brand(b)?.name),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing yet";
}
