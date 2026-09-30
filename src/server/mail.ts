import "server-only";

/*
 * Outgoing email. Sends over SMTP when SMTP_HOST is set (any provider: Brevo,
 * Google Workspace, Microsoft 365…), else through Resend when RESEND_API_KEY
 * is set; otherwise each email is skipped (and printed in development) so
 * nothing else breaks. Emails never block the action that caused them.
 */

export type MailProvider = "smtp" | "resend";

export function mailProvider(): MailProvider | null {
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export function mailEnabled() {
  return mailProvider() !== null;
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
  /** A one-time code, shown large so it is easy to read and copy. */
  code?: string;
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
  const code = m.code ? `<p style="margin:24px 0 4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:.3em;color:#0F172A">${esc(m.code)}</p>` : "";
  const quote = m.quote ? `<blockquote style="margin:20px 0;padding:14px 18px;background:#F8FAFC;border-left:3px solid #0F2A5F;border-radius:6px;color:#1E293B">${esc(m.quote)}</blockquote>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F172A">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">
<div style="font-weight:700;font-size:15px;margin-bottom:24px"><span style="display:inline-block;background:#0F2A5F;color:#fff;border-radius:7px;width:26px;height:26px;text-align:center;line-height:26px;margin-right:8px">B</span>BrandOS</div>
<div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:28px">
<h1 style="font-size:21px;margin:0 0 12px;font-weight:600">${esc(m.heading)}</h1>
<p style="font-size:16px;line-height:1.6;margin:0;color:#334155">${esc(m.body)}</p>${code}${quote}${sections.html}${button}
</div>
<p style="font-size:13px;color:#475569;margin-top:18px">${esc(m.footer ?? "You are getting this because you are on the BrandOS team.")} ${esc(appUrl())}</p>
</div></body></html>`;
  const text = [m.heading, "", m.body, m.code ? `\n${m.code}\n` : "", m.quote ? `\n"${m.quote}"` : "", sections.text, m.action ? `\n${m.action.label}: ${m.action.href}` : ""].join("\n");
  return { html, text };
}

type Transport = { sendMail(o: Record<string, unknown>): Promise<unknown>; verify(): Promise<unknown> };
const cached = globalThis as unknown as { __bosSmtp?: { key: string; t: Transport } };

/** One pooled SMTP connection per server process, rebuilt if the settings change. */
async function smtp(): Promise<Transport> {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";
  // "tls": encrypted from the first byte (port 465). "starttls": must upgrade or fail (587, the default).
  // "none": plain text, only for a mail server on the same machine or a local test catcher.
  const mode = (process.env.SMTP_SECURE?.trim().toLowerCase() || (port === 465 ? "tls" : "starttls")) as "tls" | "starttls" | "none";
  const key = [host, port, user, pass.length, mode, process.env.SMTP_TLS_SERVERNAME].join("|");
  if (cached.__bosSmtp?.key === key) return cached.__bosSmtp.t;
  const nodemailer = (await import("nodemailer")).default;
  const t = nodemailer.createTransport({
    host, port,
    secure: mode === "tls",
    requireTLS: mode === "starttls",
    ignoreTLS: mode === "none",
    auth: user ? { user, pass } : undefined,
    tls: { servername: process.env.SMTP_TLS_SERVERNAME?.trim() || host, minVersion: "TLSv1.2" },
    pool: true,
    maxConnections: 3,
  }) as unknown as Transport;
  cached.__bosSmtp = { key, t };
  return t;
}

/** Who emails come from. MAIL_FROM wins; SMTP falls back to the login when it looks like an address. */
function fromAddress(provider: MailProvider) {
  const set = process.env.MAIL_FROM?.trim();
  if (set) return set;
  if (provider === "smtp" && /@/.test(process.env.SMTP_USER ?? "")) return `BrandOS <${process.env.SMTP_USER!.trim()}>`;
  return "BrandOS <onboarding@resend.dev>";
}

/** Sends one email. Resolves to whether the provider accepted it; never throws. */
export async function sendMail(m: Mail): Promise<boolean> {
  return (await deliver(m)).ok;
}

/** Like sendMail, but says why it failed (for the admin's test email). */
export async function deliver(m: Mail): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!m.to) return { ok: false, error: "No address to send to." };
  const provider = mailProvider();
  if (!provider) {
    if (process.env.NODE_ENV !== "production") console.info(`[mail skipped — no SMTP_HOST or RESEND_API_KEY] to=${m.to} subject="${m.subject}"${m.code ? ` code=${m.code}` : ""}${m.action ? ` link=${m.action.href}` : ""}`);
    return { ok: false, error: "Email is not set up on this server." };
  }
  const { html, text } = render(m);
  try {
    if (provider === "smtp") {
      await (await smtp()).sendMail({ from: fromAddress(provider), to: m.to, subject: m.subject, html, text });
      return { ok: true };
    }
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: fromAddress(provider), to: m.to, subject: m.subject, html, text });
    if (error) { console.error("mail failed", error); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (e) {
    console.error("mail failed", e);
    // The provider's reason (e.g. "535 Authentication failed"), never the settings themselves.
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "The mail server refused the message." };
  }
}
