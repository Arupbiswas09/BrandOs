# Deploying BrandOS

Production runs on the **coolify-contabo** server (173.249.4.108), in the Coolify
project **Contabo_software → production**, at **https://pm.work.thatha.net**
(also reachable at https://pm.software.thatha.net through the existing wildcard).

```
 browser ──443──▶ Traefik (Coolify proxy) ──▶ brandos (Next.js, :3000)
                                                 │  postgres://…@<db-uuid>:5432
                                                 ▼
                                             brandos-db (Postgres 16, no public port)
```

Secrets live outside the repository:

| File | Holds |
|---|---|
| `~/.config/coolify/token` | Coolify API token |
| `~/.config/brandos/prod.env` | database password, first admin's email and password, Coolify UUIDs |

## How a deploy happens

Push to `main`. `.github/workflows/deploy.yml` asks Coolify to deploy the
**Git-build app**: Coolify clones this public repository, builds the
`Dockerfile` and rolls it out. No container registry is involved. Migrations
run when the app starts, and `/api/health` reports the commit as `version`.

Coolify has **two** BrandOS apps in Contabo_software / production. Only one is live:

| App | Source | State |
|---|---|---|
| Git-build app (`COOLIFY_APP_UUID`) | builds from this repo | **live**, serves pm.software.thatha.net |
| `brandos` | pulls `ghcr.io/arupbiswas09/brandos:latest` | retired since 25 Sep 2026; its image is no longer published, so a deploy fails ("unauthorized") or, if it pulled, would run old code |

If the GitHub deploy step fails with HTTP 401, the `COOLIFY_TOKEN` secret has
expired: make a new token in Coolify (Keys & Tokens) and save it with
`gh secret set COOLIFY_TOKEN -R Arupbiswas09/BrandOs`, or press **Deploy** on
the Git-build app in Coolify.

Uploaded files live in `/app/.data` in the container. The Git-build app must
have a Persistent Storage volume with destination `/app/.data`, or a redeploy
loses them (the database is separate and always safe).

## One-time setup

1. **Database** — `brandos-db` already exists in Contabo_software / production.
2. **App** — a Coolify application from this public Git repository (branch
   `main`, build pack Dockerfile, port 3000) with every environment variable
   from `~/.config/brandos/prod.env`. (`scripts/coolify-setup.sh` created the
   original image-based app, which is retired; see above.)
3. **Build argument** — `GIT_SHA` set to the commit, so `/api/health` reports it.
4. **Uploads** — Coolify → the app → Persistent Storage → add a volume with
   destination `/app/.data`. Without it, uploaded files are lost on redeploy.
5. **DNS** — Cloudflare → thatha.net → DNS → add `A  pm.work  173.249.4.108`,
   **DNS only** (grey cloud) so Coolify can issue the Let's Encrypt certificate.
   `*.work.thatha.net` is a wildcard to the Azure server (74.249.36.39); this one
   specific record overrides it for BrandOS only.
6. **Auto-deploy** — GitHub → Arupbiswas09/BrandOs → Settings → Secrets → Actions:
   `COOLIFY_TOKEN` and `COOLIFY_APP_UUID` (printed by the setup script).
7. **Email (optional)** — either SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS`, `MAIL_FROM`; Brevo is `smtp-relay.brevo.com` on 587 with
   STARTTLS) or `RESEND_API_KEY` and `MAIL_FROM`. Add them to
   `~/.config/brandos/prod.env` and re-run the setup script, or set them in
   Coolify → Environment Variables and redeploy. Then Settings → Email →
   **Send a test email** proves it works. Email switches on "Forgot it?",
   "Email me a sign-in code", invites by email and notifications.

## Daily digest, Slack and calendar feeds

All three are optional; without them the app works and Settings says what is off.

**Daily digest.** Needs email (above) and a `CRON_SECRET`:

1. Make a secret: `openssl rand -hex 32`. Add `CRON_SECRET` to
   `~/.config/brandos/prod.env` and re-run the setup script, or set it in
   Coolify → the Git-build app → Environment Variables, then redeploy.
2. Coolify → the Git-build app → **Scheduled Tasks** → Add:
   - Name: `digest`
   - Command: `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest`
   - Frequency: `0 7 * * *` (07:00 every day, server time)
   - Container: `brandos`

The task runs inside the app container, so `$CRON_SECRET` is already set there.
Each person gets at most one digest per day (the server's time zone; set `TZ`,
e.g. `Europe/London`, to move the day boundary), so running it twice is harmless.
The endpoint returns a JSON summary (`sent`, `alreadySent`, `failed`); a
non-2xx status makes the task show as failed in Coolify. Test by hand with the
same command in Coolify → the Git-build app → Terminal.

Without `CRON_SECRET`, anything set to "Daily digest" is emailed straight
away and due-date reminders are not sent.

**Daily link check.** Opens every asset's link (landing pages, thank-you
pages, Drive links) and flags the ones that stop opening as "Link not
responding". Uses the same `CRON_SECRET`. Add a second scheduled task:

- Name: `links`
- Command: `curl -fsS -m 600 -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/links`
- Frequency: `30 6 * * *` (06:30 every day, before the digest)
- Container: `brandos`

Links checked in the last 20 hours are skipped, so a second run is harmless.
A run checks four links at a time, at most 300, and starts no new check after
four minutes; anything left (`remaining` in the JSON summary) is picked up by
the next run. Pages are fetched by the server itself, http and https only,
never private or cloud-metadata addresses, 8 seconds and 2 MB at most each.
The first time a landing page, lead magnet or thank-you page without a picture
opens, its share image (og:image) becomes the card picture. Nothing goes in the
history unless a link that opened stops opening.

**Slack.** Create an incoming webhook for the channel (api.slack.com/apps →
Create app → Incoming Webhooks), set `SLACK_WEBHOOK_URL`, redeploy, then use
**Settings → Slack → Send test message**.

**Calendar feeds** need nothing extra. Each person makes their own private link
in Settings or on the Calendar page. Links use `APP_URL`, so keep it set to the
public address.

## First sign-in

The admin account is created on first start from `BRANDOS_ADMIN_EMAIL` /
`BRANDOS_ADMIN_PASSWORD` (in `~/.config/brandos/prod.env`). Sign in, change the
password in Settings, then invite the team from **Team and access**.
Because an admin exists, the public setup page is never offered.

## Backups

In Coolify → brandos-db → Backups, enable a daily scheduled backup to an S3
destination (not only local disk). **Settings → Export JSON** gives an
application-level export at any time.

## Rollback

Re-run an earlier **Deploy** workflow run, or in Coolify set the image tag to an
earlier commit SHA and redeploy.
