import type {
  Activity, Asset, Brand, Client, Comment, Cta, Group, Link, Offer, Service, User,
} from "@/db/schema";

export type PublicUser = Omit<User, "passwordHash">;

export type Recent = { kind: string; itemId: string };

/**
 * Everything one person is allowed to see, loaded once per request on the
 * server and handed to the browser. Already filtered by their scope.
 */
export type Workspace = {
  now: number;
  meId: string;
  /** "demo" lets anyone pick a person to sign in as; "password" is real sign-in. */
  authMode: "demo" | "password";
  aiEnabled: boolean;
  uploadsEnabled: boolean;
  users: PublicUser[];
  groups: Group[];
  clients: Client[];
  brands: Brand[];
  services: Service[];
  offers: Offer[];
  assets: Asset[];
  ctas: Cta[];
  links: Link[];
  comments: Comment[];
  activity: Activity[];
  recents: Recent[];
  /** How many items wait on each person, computed over the full data set. */
  queueCounts: Record<string, number>;
  /** Comment ids that mention me and that I have not opened yet. */
  unreadMentions: string[];
};

export type WaitOn = { who: string; verb: "Review" | "Make changes"; act: "review" | "change" };

export function waitOn(x: Pick<Asset, "review" | "reviewerId" | "ownerId"> | null | undefined): WaitOn | null {
  if (!x) return null;
  if (x.review === "In review" && x.reviewerId) return { who: x.reviewerId, verb: "Review", act: "review" };
  if (x.review === "Changes requested" && x.ownerId) return { who: x.ownerId, verb: "Make changes", act: "change" };
  return null;
}
