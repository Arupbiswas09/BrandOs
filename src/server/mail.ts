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
export function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return u.replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type Mail = { to: string; subject: string; heading: string; body: string; action?: { label: string; href: string }; quote?: string };

function render(m: Mail) {
  const button = m.action
    ? `<p style="margin:28px 0"><a href="${esc(m.action.href)}" style="background:#2D4A5C;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600;display:inline-block">${esc(m.action.label)}</a></p>`
    : "";
  const quote = m.quote ? `<blockquote style="margin:20px 0;padding:14px 18px;background:#F7F9F8;border-left:3px solid #2D4A5C;border-radius:6px;color:#2A3833">${esc(m.quote)}</blockquote>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F7F9F8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#101614">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">
<div style="font-weight:700;font-size:15px;margin-bottom:24px"><span style="display:inline-block;background:#2D4A5C;color:#fff;border-radius:7px;width:26px;height:26px;text-align:center;line-height:26px;margin-right:8px">B</span>BrandOS</div>
<div style="background:#fff;border:1px solid #E1E7E4;border-radius:14px;padding:28px">
<h1 style="font-size:21px;margin:0 0 12px;font-weight:600">${esc(m.heading)}</h1>
<p style="font-size:16px;line-height:1.6;margin:0;color:#3E4A45">${esc(m.body)}</p>${quote}${button}
</div>
<p style="font-size:13px;color:#566560;margin-top:18px">You are getting this because you are on the BrandOS team. ${esc(appUrl())}</p>
</div></body></html>`;
  const text = [m.heading, "", m.body, m.quote ? `\n"${m.quote}"` : "", m.action ? `\n${m.action.label}: ${m.action.href}` : ""].join("\n");
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
