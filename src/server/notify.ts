import "server-only";
import { after } from "next/server";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { NotifyEvent, QueuedNotification, User } from "@/db/schema";
import { prefOf } from "@/lib/notify";
import { dueLabel } from "@/lib/time";
import { waitOn } from "@/lib/types";
import { appUrl, mailEnabled, sendMail, type Mail, type MailItem, type MailSection } from "@/server/mail";
import { makeVisibility, readAll, scopeFor, type All } from "@/server/data";

/*
 * Who gets emailed about what, and when.
 *
 *   instant → sent straight after the action
 *   digest  → kept in notification_queue until the morning digest
 *   off     → nothing
 *
 * The digest only exists when CRON_SECRET is set (something has to call
 * /api/cron/digest each morning). Without it, "digest" falls back to instant
 * so nothing waits forever.
 */

export function digestEnabled() {
  return !!process.env.CRON_SECRET?.trim();
}

export const itemUrl = (kind: "offer" | "asset", id: string) => (kind === "offer" ? `${appUrl()}/offers/${id}` : `${appUrl()}/?asset=${id}`);

const SETTINGS_FOOTER = "Choose what BrandOS emails you, and when, in Settings → Notifications.";

/** Emails (or queues for the digest) one notice per person, after the response is sent. */
export function notifyPeople(
  all: All,
  event: NotifyEvent,
  userIds: (string | null | undefined)[],
  build: (firstName: string) => Omit<Mail, "to">,
  skip?: string,
) {
  const people = [...new Set(userIds.filter((x): x is string => !!x && x !== skip))]
    .map((id) => all.users.find((u) => u.id === id))
    .filter((u): u is User => !!u?.email)
    .filter((u) => prefOf(u.notifyPrefs, event) !== "off");
  if (!people.length) return;
  after(async () => {
    const queue = mailEnabled() && digestEnabled();
    for (const u of people) {
      const m = build(u.name.split(" ")[0]);
      try {
        if (queue && prefOf(u.notifyPrefs, event) === "digest") {
          const db = await getDb();
          await db.insert(s.notificationQueue).values({
            id: "nq" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
            userId: u.id, event, subject: m.subject, heading: m.heading, body: m.body,
            quote: m.quote ?? null, href: m.action?.href ?? null,
          });
        } else {
          await sendMail({ to: u.email!, footer: SETTINGS_FOOTER, ...m });
        }
      } catch (e) {
        console.error("notify failed", e);
      }
    }
  });
}

/* ================================================================ the daily digest */

const QUEUE_TITLES: Record<NotifyEvent, string> = {
  review: "Waiting for your review",
  changes: "Sent back to you with changes",
  approved: "Approved",
  mention: "You were mentioned",
  due: "Due",
};

type DueItem = { kind: "asset" | "offer"; id: string; name: string; brand: string; dueAt: Date };

/** Work this person owns or has to act on, due in the next two days or already late. */
export function dueFor(all: All, u: User, now: Date): DueItem[] {
  const vis = makeVisibility(all, scopeFor(all, u.id));
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const brandName = (id: string | null) => (id ? all.brands.find((b) => b.id === id)?.name ?? "" : "Global Library");
  const mine = (x: { ownerId: string | null; review: s.Review; reviewerId: string | null }) => x.ownerId === u.id || waitOn(x)?.who === u.id;
  const out: DueItem[] = [];
  for (const a of all.assets) {
    if (!a.dueAt || a.archived || a.status === "Live" || a.dueAt >= horizon || !mine(a) || !vis.asset(a.id)) continue;
    out.push({ kind: "asset", id: a.id, name: a.name, brand: brandName(a.brandId), dueAt: a.dueAt });
  }
  for (const o of all.offers) {
    if (!o.dueAt || o.archived || o.status === "Active" || o.dueAt >= horizon || !mine(o) || !vis.offer(o.id)) continue;
    out.push({ kind: "offer", id: o.id, name: o.name, brand: brandName(o.brandId), dueAt: o.dueAt });
  }
  return out.sort((x, y) => +x.dueAt - +y.dueAt);
}

function dueSections(items: DueItem[], now: Date): MailSection[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const row = (x: DueItem): MailItem => ({
    text: x.name,
    sub: `${x.brand} · ${x.kind === "offer" ? "Offer launch" : "Asset"} · ${dueLabel(x.dueAt, +now).label}`,
    href: itemUrl(x.kind, x.id),
  });
  const late = items.filter((x) => x.dueAt < today);
  const soon = items.filter((x) => x.dueAt >= today);
  return [
    ...(late.length ? [{ title: "Overdue", items: late.map(row) }] : []),
    ...(soon.length ? [{ title: "Due in the next two days", items: soon.map(row) }] : []),
  ];
}

function queueSections(rows: QueuedNotification[]): MailSection[] {
  const order: NotifyEvent[] = ["review", "changes", "mention", "approved"];
  return order
    .map((ev) => ({
      title: QUEUE_TITLES[ev],
      items: rows.filter((r) => r.event === ev).map((r): MailItem => ({ text: r.heading, sub: r.body || undefined, quote: r.quote ?? undefined, href: r.href ?? undefined })),
    }))
    .filter((sec) => sec.items.length);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export type DigestResult = { ok: boolean; mail: boolean; sent: number; alreadySent: number; failed: number; note?: string };

/**
 * One email per person with anything queued or anything of theirs due soon.
 * Safe to run more than once a day: each person gets at most one digest per
 * calendar day (server time zone), and a failed send is retried next run.
 */
export async function runDigest(now = new Date()): Promise<DigestResult> {
  if (!mailEnabled()) return { ok: true, mail: false, sent: 0, alreadySent: 0, failed: 0, note: "Email is not set up (RESEND_API_KEY), so no digest was sent." };
  const db = await getDb();
  const all = await readAll();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const queued = await db.select().from(s.notificationQueue).orderBy(s.notificationQueue.createdAt);

  // Queue rows for people who have since been removed can never be sent.
  const known = new Set(all.users.map((u) => u.id));
  const orphans = queued.filter((q) => !known.has(q.userId)).map((q) => q.id);
  if (orphans.length) await db.delete(s.notificationQueue).where(inArray(s.notificationQueue.id, orphans));

  const res: DigestResult = { ok: true, mail: true, sent: 0, alreadySent: 0, failed: 0 };
  for (const u of all.users) {
    if (!u.email) continue;
    const mine = queued.filter((q) => q.userId === u.id);
    const dueMode = prefOf(u.notifyPrefs, "due");
    const due = dueMode === "off" ? [] : dueFor(all, u, now);
    if (!mine.length && !due.length) continue;
    if (u.lastDigestAt && u.lastDigestAt >= startOfDay) { res.alreadySent++; continue; }

    // Claim today's digest first, so two overlapping runs cannot both send.
    const claimed = await db.update(s.users).set({ lastDigestAt: now })
      .where(and(eq(s.users.id, u.id), or(isNull(s.users.lastDigestAt), lt(s.users.lastDigestAt, startOfDay))))
      .returning({ id: s.users.id });
    if (!claimed.length) { res.alreadySent++; continue; }

    const first = u.name.split(" ")[0];
    const dueInDigest = dueMode === "digest" ? due : [];
    const mails: Mail[] = [];
    if (dueMode === "instant" && due.length) {
      mails.push({
        to: u.email, footer: SETTINGS_FOOTER,
        subject: `${plural(due.length, "thing")} of yours ${due.length === 1 ? "is" : "are"} due soon`,
        heading: "What is due",
        body: `Good morning ${first}. This is your work that is late or due in the next two days.`,
        sections: dueSections(due, now),
        action: { label: "Open the calendar", href: `${appUrl()}/calendar` },
      });
    }
    if (mine.length || dueInDigest.length) {
      const parts = [mine.length ? plural(mine.length, "update") : "", dueInDigest.length ? `${dueInDigest.length} due soon` : ""].filter(Boolean);
      mails.push({
        to: u.email, footer: SETTINGS_FOOTER,
        subject: `Your BrandOS digest: ${parts.join(", ")}`,
        heading: "Your daily digest",
        body: `Good morning ${first}. Here is what happened since your last digest, and what is coming up.`,
        sections: [...dueSections(dueInDigest, now), ...queueSections(mine)],
        action: { label: "Open BrandOS", href: appUrl() },
      });
    }

    let allOk = true;
    for (const m of mails) if (!(await sendMail(m))) allOk = false;
    if (allOk) {
      if (mine.length) await db.delete(s.notificationQueue).where(inArray(s.notificationQueue.id, mine.map((q) => q.id)));
      res.sent++;
    } else {
      // Give the claim back so the next run tries again. Queued items stay queued.
      await db.update(s.users).set({ lastDigestAt: u.lastDigestAt }).where(eq(s.users.id, u.id));
      res.failed++;
    }
  }
  res.ok = res.failed === 0;
  return res;
}
