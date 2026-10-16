import type { Access, Brand, Group, User } from "@/db/schema";

/*
 * Two things decide what a person gets:
 *
 *   - Their ROLE says what they can DO (the permission table below).
 *   - Their SCOPE says what they can SEE (every client, or chosen clients,
 *     brands and groups).
 *
 * Contributors can change only the work they own. BrandOS is internal only:
 * the old Client guest role is no longer offered, and anyone who still has it
 * is shown as "No access" and cannot sign in (see server/session).
 *
 * This module is pure so the server and the browser make the same decisions.
 * The browser uses it only to hide buttons; every server action checks again.
 */

export type Perm =
  | "comment"   // write and resolve notes
  | "review"    // approve or send back
  | "edit"      // create and change offers, assets, services, CTAs
  | "upload"    // add files to assets
  | "publish"   // mark work Live
  | "archive"   // archive and restore
  | "structure" // add and change clients, brands and sub-brands
  | "kit"       // change a Brand Kit (colours, fonts, logo rules, voice)
  | "library"   // change the Global Library
  | "share"     // mark assets as cleared to send
  | "del"       // delete assets (files and all) and use the recycle bin; archive whole clients and brands
  | "export"    // download all the data
  | "access";   // invite people and change what they can see and do

/**
 * Clients, brands (sub-brands too), services and offers are never deleted,
 * not even by an admin. They are archived instead, which hides them and can
 * be undone; an offer that was cancelled or added by mistake goes back to
 * draft. Assets and the files on them are the only work that can be deleted.
 */
export const NEVER_DELETED = ["client", "brand", "service", "offer"] as const;
export const neverDeleted = (kind: string) => (NEVER_DELETED as readonly string[]).includes(kind);
export const NEVER_DELETED_NOTE = "Clients, brands, services and offers are never deleted. Archive it instead: that hides it and can be undone.";

/**
 * Roles offered when inviting people. BrandOS is internal only, so the old
 * Client guest role is not among them; anyone who still has it has no access.
 */
export const ROLES: Access[] = ["Admin", "Manager", "Editor", "Contributor", "Reviewer", "Viewer"];

const T = true, F = false;
const row = (comment: boolean, review: boolean, edit: boolean, publish: boolean, archive: boolean, structure: boolean, kit: boolean, library: boolean, share: boolean, del: boolean, exp: boolean, access: boolean): Record<Perm, boolean> =>
  // Uploading follows editing unless an admin says otherwise for one person.
  ({ comment, review, edit, upload: edit, publish, archive, structure, kit, library, share, del, export: exp, access });

export const PERMISSIONS: Record<Access, Record<Perm, boolean>> = {
  //                 comment review edit publish archive structure kit library share del export access
  Admin:       row(T, T, T, T, T, T, T, T, T, T, T, T),
  // Deleting assets, and archiving whole clients or brands, is for admins only. Nobody deletes the rest (see NEVER_DELETED).
  Manager:     row(T, T, T, T, T, T, T, T, T, F, F, F),
  Editor:      row(T, T, T, T, T, F, F, F, F, F, F, F),
  Contributor: row(T, F, T, F, F, F, F, F, F, F, F, F),
  Reviewer:    row(T, T, F, F, F, F, F, F, F, F, F, F),
  Viewer:      row(F, F, F, F, F, F, F, F, F, F, F, F),
  // The old guest role: no access at all.
  Client:      row(F, F, F, F, F, F, F, F, F, F, F, F),
};

/** Plain-language names for the permission table, in display order. */
export const PERM_INFO: { perm: Perm | "view" | "own"; label: string; note: string }[] = [
  { perm: "view", label: "See their clients", note: "Only the clients, brands and groups they are given." },
  { perm: "comment", label: "Comment", note: "Write notes, @mention people and tick checklists." },
  { perm: "review", label: "Approve or send back", note: "Approve work or ask for changes when it is in review." },
  { perm: "edit", label: "Create and edit work", note: "Offers, assets, services and CTAs." },
  { perm: "own", label: "Edit other people's work", note: "Contributors can edit only what they own." },
  { perm: "upload", label: "Upload files", note: "Add images, video, documents and other files, within the upload limits." },
  { perm: "publish", label: "Mark work Live", note: "Say an asset is out in the world." },
  { perm: "archive", label: "Archive work", note: "Put offers, services and assets away without deleting them. Clients and brands: admins only." },
  { perm: "structure", label: "Set up clients and brands", note: "Add and change clients, brands and sub-brands." },
  { perm: "kit", label: "Edit Brand Kits", note: "Colours, fonts, logo rules and voice." },
  { perm: "library", label: "Edit the Global Library", note: "Checklists, prompts, templates and SOPs." },
  { perm: "share", label: "Clear work to send", note: "Mark an asset as signed off and safe to send to the client." },
  { perm: "del", label: "Delete assets, and archive clients or brands", note: "Delete assets with their files, and CTAs, and use the recycle bin, where they wait 30 days. Clients, brands, services and offers are never deleted by anyone: they are archived." },
  { perm: "export", label: "Export all data", note: "Download everything as JSON." },
  { perm: "access", label: "Manage the team", note: "Invite people, set roles and choose what they see." },
];

export const ROLE_INFO: Record<Access, { summary: string; color: string }> = {
  Admin: { summary: "Everything, everywhere. The only role that manages the team, deletes assets, archives whole clients and brands, and exports data.", color: "#6D28D9" },
  Manager: { summary: "Runs client work end to end: sets up brands and owns Brand Kits and strategy. Cannot delete assets or archive whole clients.", color: "#1D4ED8" },
  Editor: { summary: "Creates and edits all work in their clients, reviews it and marks it Live.", color: "#047857" },
  Contributor: { summary: "Creates work and edits what they own, then sends it for review. Cannot approve.", color: "#0E7490" },
  Reviewer: { summary: "Reads, comments, approves or sends back. Changes nothing themselves.", color: "#B45309" },
  Viewer: { summary: "Reads only. For people who need to find things, not change them.", color: "#46534D" },
  Client: { summary: "No access. The old client guest role: they cannot sign in until an admin gives them a role.", color: "#56645E" },
};

type ScopeUser = Pick<User, "access" | "allClients" | "clientIds" | "brandIds" | "groupIds">;
type ScopeBrand = Pick<Brand, "id" | "clientId" | "parentId">;

/** Permissions an admin may switch on or off for one person, on top of their role. */
export const OVERRIDABLE: Perm[] = ["comment", "review", "edit", "upload", "publish", "archive", "structure", "kit", "library", "share", "del", "export"];
type PermUser = Pick<User, "access"> & { permOverrides?: Partial<Record<string, boolean>> | null };

/** What the role alone allows, ignoring any per-person exception. */
export function roleCan(access: Access, perm: Perm): boolean {
  return !!(PERMISSIONS[access] ?? PERMISSIONS.Viewer)[perm];
}

export function can(user: PermUser | null | undefined, perm: Perm): boolean {
  if (!user || user.access === "Client") return false;
  const base = roleCan(user.access, perm);
  // Managing the team stays tied to the Admin role, so nobody is locked out or quietly promoted.
  if (perm === "access" || !OVERRIDABLE.includes(perm)) return base;
  const o = user.permOverrides?.[perm];
  if (o === false) return false;
  if (o === true) return true;
  return base;
}

/** Only the exceptions that actually change something, for storing and showing. */
export function cleanOverrides(access: Access, o: Partial<Record<string, boolean>> | null | undefined): Partial<Record<Perm, boolean>> {
  const out: Partial<Record<Perm, boolean>> = {};
  if (access === "Client") return out;
  for (const p of OVERRIDABLE) {
    const v = o?.[p];
    if (typeof v !== "boolean" || v === roleCan(access, p)) continue;
    out[p] = v;
  }
  return out;
}

/** Contributors change only what they own; everyone with `edit` changes the rest. */
export function canChange(user: (PermUser & Pick<User, "id">) | null | undefined, item?: { ownerId?: string | null } | null): boolean {
  if (!user || !can(user, "edit")) return false;
  if (user.access !== "Contributor") return true;
  return !item || item.ownerId === user.id;
}

/** The old Client role. Such people cannot sign in; kept so older records still read. */
export const isGuest = (user: Pick<User, "access"> | null | undefined) => user?.access === "Client";
export const NO_ACCESS_LABEL = "No access";

export type Scope = { all: boolean; clients: Set<string>; brands: Set<string>; guest: boolean };

export function scopeOf(user: ScopeUser, groups: Pick<Group, "id" | "clientIds" | "brandIds">[]): Scope {
  const guest = user.access === "Client";
  // No access sees nothing, whatever the flags say.
  if (guest) return { all: false, clients: new Set(), brands: new Set(), guest };
  if (user.allClients) return { all: true, clients: new Set(), brands: new Set(), guest };
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
  if (user.access === "Client") return "Cannot sign in";
  if (user.allClients) return "Every client";
  const parts = [
    ...(user.groupIds ?? []).map((g) => lookup.group(g)?.name),
    ...(user.clientIds ?? []).map((c) => lookup.client(c)?.name),
    ...(user.brandIds ?? []).map((b) => lookup.brand(b)?.name),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing yet";
}
