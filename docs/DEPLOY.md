# Deploying BrandOS

Production runs on the **coolify-contabo** server (173.249.4.108), in the Coolify
project **Contabo_software → production**, at **https://pm.thatha.net**
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

Push to `main`. `.github/workflows/deploy.yml` builds the Dockerfile, pushes
`ghcr.io/thathaorg/brandos:<sha>` and `:latest`, pins the Coolify app to that
tag and deploys it, then checks `/api/health`. The server never clones the
private repository; it only pulls the finished image. Migrations run when the
app starts.

## One-time setup

1. **Database** — `brandos-db` already exists in Contabo_software / production.
2. **App** — run `bash scripts/coolify-setup.sh`. It creates the `brandos`
   application from the image, sets every environment variable, and deploys.
3. **Registry** — Coolify has to be able to pull the image. Either make the
   package public (it holds compiled code only; secrets are env vars):
   github.com/orgs/thathaorg/packages/container/brandos/settings → Change visibility → Public,
   or keep it private and on the server run `docker login ghcr.io` with a
   read-only token.
4. **Uploads** — Coolify → brandos → Persistent Storage → add a volume with
   destination `/app/.data`. Without it, uploaded files are lost on redeploy.
5. **DNS** — Cloudflare → thatha.net → DNS → add `A  pm  173.249.4.108`,
   **DNS only** (grey cloud) so Coolify can issue the Let's Encrypt certificate.
6. **Auto-deploy** — GitHub → thathaorg/BrandOs → Settings → Secrets → Actions:
   `COOLIFY_TOKEN` and `COOLIFY_APP_UUID` (printed by the setup script).
7. **Email (optional)** — add `RESEND_API_KEY` and `MAIL_FROM` to
   `~/.config/brandos/prod.env` and re-run the setup script, or set them in Coolify.

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
