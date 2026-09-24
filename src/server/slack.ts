import "server-only";
import { after } from "next/server";

/*
 * Posts to one Slack channel through an incoming webhook (SLACK_WEBHOOK_URL).
 * Optional: without the variable nothing is sent. Slack being slow or down
 * never slows or fails the action that caused the post.
 */

/** Any https webhook that takes Slack's `{ text }` format (Slack, Mattermost, Rocket.Chat). */
export function slackEnabled() {
  return /^https:\/\/\S+$/.test(webhook());
}

const webhook = () => process.env.SLACK_WEBHOOK_URL?.trim() ?? "";

/** Slack's own escaping for message text: only &, < and > are special. */
export const slackEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A link in Slack's markup: <https://…|label>. */
export const slackLink = (href: string, label: string) => `<${href.replace(/[<>|]/g, "")}|${slackEsc(label).replace(/\|/g, "¦")}>`;

/** Sends now and says whether Slack accepted it. */
export async function postSlack(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!slackEnabled()) return { ok: false, error: "Slack is not set up. Add SLACK_WEBHOOK_URL to the server's environment." };
  try {
    const res = await fetch(webhook(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const why = (await res.text().catch(() => "")).slice(0, 120);
      console.error("slack failed", res.status, why);
      return { ok: false, error: `Slack said no (${res.status}${why ? `: ${why}` : ""}). Check the webhook URL.` };
    }
    return { ok: true };
  } catch (e) {
    console.error("slack failed", e);
    return { ok: false, error: "Slack could not be reached. Try again in a moment." };
  }
}

/** Fire and forget, after the response has gone. */
export function slackLater(text: string) {
  if (!slackEnabled()) return;
  after(async () => { await postSlack(text); });
}
