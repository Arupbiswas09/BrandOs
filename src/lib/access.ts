import type { Access, Brand, Group, User } from "@/db/schema";

/*
 * Two things decide what a person gets:
 *
 *   - Their ROLE says what they can DO (the permission table below).
 *   - Their SCOPE says what they can SEE (every client, or chosen clients,
 *     brands and groups).
 *
 * Contributors can change only the work they own. Clients are outside
 * guests: they see only what has been marked "visible to client", and can
 * comment and approve it.
 *
 * This module is pure so the server and the browser make the same decisions.
 * The browser uses it only to hide buttons; every server action checks again.
 */

export type Perm =
  | "comment"   // write and resolve notes
  | "review"    // approve or send back
  | "edit"      // create and change offers, assets, services, CTAs
  | "publish"   // mark work Live
  | "archive"   // archive and restore
  | "structure" // add and change clients, brands and sub-brands
  | "kit"       // change a Brand Kit (colours, fonts, logo rules, voice)
  | "library"   // change the Global Library
  | "share"     // create and revoke client share links
  | "del"       // delete and use the recycle bin
  | "export"    // download all the data
  | "access";   // invite people and change what they can see and do

export const ROLES: Access[] = ["Admin", "Manager", "Editor", "Contributor", "Reviewer", "Viewer", "Client"];

const T = true, F = false;
const row = (comment: boolean, review: boolean, edit: boolean, publish: boolean, archive: boolean, structure: boolean, kit: boolean, library: boolean, share: boolean, del: boolean, exp: boolean, access: boolean): Record<Perm, boolean> =>
  ({ comment, review, edit, publish, archive, structure, kit, library, share, del, export: exp, access });

export const PERMISSIONS: Record<Access, Record<Perm, boolean>> = {
  //                 comment review edit publish archive structure kit library share del export access
  Admin:       row(T, T, T, T, T, T, T, T, T, T, T, T),
  Manager:     row(T, T, T, T, T, T, T, T, T, T, F, F),
  Editor:      row(T, T, T, T, T, F, F, F, F, F, F, F),
  Contributor: row(T, F, T, F, F, F, F, F, F, F, F, F),
  Reviewer:    row(T, T, F, F, F, F, F, F, F, F, F, F),
  Viewer:      row(F, F, F, F, F, F, F, F, F, F, F, F),
  Client:      row(T, T, F, F, F, F, F, F, F, F, F, F),
};

/** Plain-language names for the permission table, in display order. */
export const PERM_INFO: { perm: Perm | "view" | "own"; label: string; note: string }[] = [
  { perm: "view", label: "See their clients", note: "Only the clients, brands and groups they are given. Clients see only what is shared with them." },
  { perm: "comment", label: "Comment", note: "Write notes, @mention people and tick checklists." },
  { perm: "review", label: "Approve or send back", note: "Approve work or ask for changes when it is in review." },
  { perm: "edit", label: "Create and edit work", note: "Offers, assets, services and CTAs." },
  { perm: "own", label: "Edit other people's work", note: "Contributors can edit only what they own." },
  { perm: "publish", label: "Mark work Live", note: "Say an asset is out in the world." },
  { perm: "archive", label: "Archive", note: "Put things away without deleting them." },
  { perm: "structure", label: "Set up clients and brands", note: "Add and change clients, brands and sub-brands." },
  { perm: "kit", label: "Edit Brand Kits", note: "Colours, fonts, logo rules and voice." },
  { perm: "library", label: "Edit the Global Library", note: "Checklists, prompts, templates and SOPs." },
  { perm: "share", label: "Share with clients", note: "Create and revoke read-only share links." },
  { perm: "del", label: "Delete and restore", note: "Delete things and use the recycle bin." },
  { perm: "export", label: "Export all data", note: "Download everything as JSON." },
  { perm: "access", label: "Manage the team", note: "Invite people, set roles and choose what they see." },
];

export const ROLE_INFO: Record<Access, { summary: string; color: string; guest?: boolean }> = {
  Admin: { summary: "Everything, everywhere. The only role that manages the team and exports data.", color: "#6D28D9" },
  Manager: { summary: "Runs client work end to end: sets up brands, owns Brand Kits, shares with clients and deletes.", color: "#1D4ED8" },
  Editor: { summary: "Creates and edits all work in their clients, reviews it and marks it Live.", color: "#047857" },
  Contributor: { summary: "Creates work and edits what they own, then sends it for review. Cannot approve.", color: "#0E7490" },
  Reviewer: { summary: "Reads, comments, approves or sends back. Changes nothing themselves.", color: "#B45309" },
  Viewer: { summary: "Reads only. For people who need to find things, not change them.", color: "#475569" },
  Client: { summary: "An outside guest. Sees only work marked visible to the client, and can comment and approve it.", color: "#BE185D", guest: true },
};

type ScopeUser = Pick<User, "access" | "allClients" | "clientIds" | "brandIds" | "groupIds">;
type ScopeBrand = Pick<Brand, "id" | "clientId" | "parentId">;

export function can(user: Pick<User, "access"> | null | undefined, perm: Perm): boolean {
  if (!user) return false;
  return !!(PERMISSIONS[user.access] ?? PERMISSIONS.Viewer)[perm];
}

/** Contributors change only what they own; everyone with `edit` changes the rest. */
export function canChange(user: Pick<User, "id" | "access"> | null | undefined, item?: { ownerId?: string | null } | null): boolean {
  if (!user || !can(user, "edit")) return false;
  if (user.access !== "Contributor") return true;
  return !item || item.ownerId === user.id;
}

export const isGuest = (user: Pick<User, "access"> | null | undefined) => user?.access === "Client";

export type Scope = { all: boolean; clients: Set<string>; brands: Set<string>; guest: boolean };

export function scopeOf(user: ScopeUser, groups: Pick<Group, "id" | "clientIds" | "brandIds">[]): Scope {
  const guest = user.access === "Client";
  // Guests never get "every client", whatever the flag says.
  if (user.allClients && !guest) return { all: true, clients: new Set(), brands: new Set(), guest };
  const clients = new Set(user.clientIds ?? []);
  const brands = new Set(user.brandIds ?? []);
  for (const gid of user.groupIds ?? []) {
    const g = groups.find((x) => x.id === gid);
    if (!g) continue;
    g.clientIds.forEach((c) => clients.add(c));
    g.brandIds.forEach((b) => brands.add(b));
  }
  return { all: false, clients, brands, guest };
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
  if (user.allClients && user.access !== "Client") return "Every client";
  const parts = [
    ...(user.groupIds ?? []).map((g) => lookup.group(g)?.name),
    ...(user.clientIds ?? []).map((c) => lookup.client(c)?.name),
    ...(user.brandIds ?? []).map((b) => lookup.brand(b)?.name),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing yet";
}
