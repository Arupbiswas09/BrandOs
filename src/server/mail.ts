import "server-only";

/*
 * Outgoing email. Sends through Resend when RESEND_API_KEY is set; otherwise
 * each email is skipped (and printed in development) so nothing else breaks.
 * Emails never block the action that caused them.
 */

export function mailEnabled() {
  return !!process.env.RESEND_API_KEY;
}

/** The public address of this install, for links inside emails. */
/**
 * The public address, for links in emails, Slack and calendar feeds.
 * APP_URL wins; otherwise the first domain Coolify gives the container
 * (COOLIFY_URL / COOLIFY_FQDN, comma-separated), then Vercel's, then localhost.
 */
export function appUrl() {
  const coolify = (process.env.COOLIFY_URL || process.env.COOLIFY_FQDN || "").split(",").map((x) => x.trim()).find(Boolean);
  const u = process.env.APP_URL?.trim()
    || (coolify ? (coolify.startsWith("http") ? coolify : `https://${coolify}`) : "")
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return u.replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type MailItem = { text: string; sub?: string; href?: string; quote?: string };
/** A titled list inside the card, used by the daily digest. */
export type MailSection = { title: string; items: MailItem[] };

export type Mail = {
  to: string; subject: string; heading: string; body: string;
  action?: { label: string; href: string }; quote?: string;
  sections?: MailSection[];
  /** Replaces the default footer line, e.g. to say how to change email settings. */
  footer?: string;
};

function renderSections(list: MailSection[] | undefined) {
  if (!list?.length) return { html: "", text: "" };
  const html = list.map((sec) => {
    const rows = sec.items.map((it) => {
      const title = it.href
        ? `<a href="${esc(it.href)}" style="color:#0F2A5F;font-weight:600;text-decoration:none">${esc(it.text)}</a>`
        : `<span style="font-weight:600">${esc(it.text)}</span>`;
      const sub = it.sub ? `<div style="font-size:14px;color:#475569;margin-top:2px">${esc(it.sub)}</div>` : "";
      const quote = it.quote ? `<div style="font-size:14px;color:#1E293B;margin-top:6px;padding:8px 12px;background:#F8FAFC;border-left:3px solid #0F2A5F;border-radius:4px">${esc(it.quote)}</div>` : "";
      return `<li style="padding:10px 0;border-top:1px solid #E2E8F0;list-style:none">${title}${sub}${quote}</li>`;
    }).join("");
    return `<h2 style="font-size:15px;margin:24px 0 4px;font-weight:600;color:#0F172A">${esc(sec.title)} <span style="color:#64748B;font-weight:400">${sec.items.length}</span></h2><ul style="margin:0;padding:0">${rows}</ul>`;
  }).join("");
  const text = list.map((sec) => [`\n${sec.title} (${sec.items.length})`, ...sec.items.map((it) =>
    `- ${it.text}${it.sub ? ` (${it.sub})` : ""}${it.quote ? `\n  "${it.quote}"` : ""}${it.href ? `\n  ${it.href}` : ""}`)].join("\n")).join("\n");
  return { html, text };
}

function render(m: Mail) {
  const button = m.action
    ? `<p style="margin:28px 0"><a href="${esc(m.action.href)}" style="background:#0F2A5F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600;display:inline-block">${esc(m.action.label)}</a></p>`
    : "";
  const sections = renderSections(m.sections);
  const quote = m.quote ? `<blockquote style="margin:20px 0;padding:14px 18px;background:#F8FAFC;border-left:3px solid #0F2A5F;border-radius:6px;color:#1E293B">${esc(m.quote)}</blockquote>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F172A">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">
<div style="font-weight:700;font-size:15px;margin-bottom:24px"><span style="display:inline-block;background:#0F2A5F;color:#fff;border-radius:7px;width:26px;height:26px;text-align:center;line-height:26px;margin-right:8px">B</span>BrandOS</div>
<div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:28px">
<h1 style="font-size:21px;margin:0 0 12px;font-weight:600">${esc(m.heading)}</h1>
<p style="font-size:16px;line-height:1.6;margin:0;color:#334155">${esc(m.body)}</p>${quote}${sections.html}${button}
</div>
<p style="font-size:13px;color:#475569;margin-top:18px">${esc(m.footer ?? "You are getting this because you are on the BrandOS team.")} ${esc(appUrl())}</p>
</div></body></html>`;
  const text = [m.heading, "", m.body, m.quote ? `\n"${m.quote}"` : "", sections.text, m.action ? `\n${m.action.label}: ${m.action.href}` : ""].join("\n");
  return { html, text };
}

export async function sendMail(m: Mail): Promise<boolean> {
  if (!m.to) return false;
  if (!mailEnabled()) {
    if (process.env.NODE_ENV !== "production") console.info(`[mail skipped — no RESEND_API_KEY] to=${m.to} subject="${m.subject}"${m.action ? ` link=${m.action.href}` : ""}`);
    return false;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { html, text } = render(m);
    const { error } = await resend.emails.send({
      from: process.env.MAIL_FROM || "BrandOS <onboarding@resend.dev>",
      to: m.to,
      subject: m.subject,
      html,
      text,
    });
    if (error) { console.error("mail failed", error); return false; }
    return true;
  } catch (e) {
    console.error("mail failed", e);
    return false;
  }
}
