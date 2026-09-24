#!/usr/bin/env bash
# One-time setup of BrandOS on Coolify (Contabo_software / production).
# Run from your own terminal:   bash scripts/coolify-setup.sh
#
# Reads the Coolify API token from ~/.config/coolify/token and the generated
# secrets from ~/.config/brandos/prod.env (both outside the repo, mode 600).
# Prints no secret. Safe to re-run: it reuses the app if it already exists.
set -euo pipefail

CO=https://app.coolify.io
TOKEN=$(cat ~/.config/coolify/token)
set -a; . ~/.config/brandos/prod.env; set +a

SERVER=q4tk1gx27opcbt32hm0edtn6     # coolify-contabo (173.249.4.108)
PROJECT=yn3q9che48fcxgdkxgqtncjp    # Contabo_software
ENVNAME=production
DOMAINS="https://pm.work.thatha.net,https://pm.software.thatha.net"

api() { curl --fail-with-body -sS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }

if [ -z "${COOLIFY_APP_UUID:-}" ]; then
  echo "Creating the brandos application…"
  COOLIFY_APP_UUID=$(api -X POST "$CO/api/v1/applications/dockerimage" -d "{
    \"project_uuid\":\"$PROJECT\",\"server_uuid\":\"$SERVER\",\"environment_name\":\"$ENVNAME\",
    \"name\":\"brandos\",\"description\":\"BrandOS — agency brand workspace\",
    \"docker_registry_image_name\":\"ghcr.io/thathaorg/brandos\",\"docker_registry_image_tag\":\"latest\",
    \"ports_exposes\":\"3000\",\"domains\":\"$DOMAINS\",
    \"health_check_enabled\":true,\"health_check_path\":\"/api/health\",\"health_check_port\":\"3000\",
    \"instant_deploy\":false}" | jq -r .uuid)
  echo "COOLIFY_APP_UUID=$COOLIFY_APP_UUID" >> ~/.config/brandos/prod.env
fi
echo "App: $COOLIFY_APP_UUID"

setenv() {
  api -X PATCH "$CO/api/v1/applications/$COOLIFY_APP_UUID/envs" -d "{\"key\":\"$1\",\"value\":$(jq -Rn --arg v "$2" '$v'),\"is_preview\":false}" >/dev/null 2>&1 \
    || api -X POST "$CO/api/v1/applications/$COOLIFY_APP_UUID/envs" -d "{\"key\":\"$1\",\"value\":$(jq -Rn --arg v "$2" '$v'),\"is_preview\":false}" >/dev/null
  echo "  set $1"
}

echo "Environment:"
setenv DATABASE_URL "postgres://brandos:${DB_PASSWORD}@${BRANDOS_DB_UUID}:5432/brandos"
setenv APP_URL "https://pm.work.thatha.net"
setenv BRANDOS_AUTH "password"
setenv BRANDOS_SEED "off"
setenv BRANDOS_ADMIN_EMAIL "$ADMIN_EMAIL"
setenv BRANDOS_ADMIN_PASSWORD "$ADMIN_PASSWORD"
setenv BRANDOS_ADMIN_NAME "Arup"
[ -n "${RESEND_API_KEY:-}" ] && setenv RESEND_API_KEY "$RESEND_API_KEY"
[ -n "${MAIL_FROM:-}" ] && setenv MAIL_FROM "$MAIL_FROM"
[ -n "${ANTHROPIC_API_KEY:-}" ] && setenv ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
[ -n "${CRON_SECRET:-}" ] && setenv CRON_SECRET "$CRON_SECRET"
[ -n "${SLACK_WEBHOOK_URL:-}" ] && setenv SLACK_WEBHOOK_URL "$SLACK_WEBHOOK_URL"
[ -n "${AUTH_SECRET:-}" ] && setenv AUTH_SECRET "$AUTH_SECRET"
[ -n "${GOOGLE_CLIENT_ID:-}" ] && setenv GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
[ -n "${GOOGLE_CLIENT_SECRET:-}" ] && setenv GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
[ -n "${GOOGLE_ALLOWED_DOMAIN:-}" ] && setenv GOOGLE_ALLOWED_DOMAIN "$GOOGLE_ALLOWED_DOMAIN"

echo "Deploying…"
api -X POST "$CO/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=true" | jq -r '.deployments[0].deployment_uuid // .message'
echo
echo "Done. Still to do by hand (see docs/DEPLOY.md):"
echo "  0. github.com/orgs/thathaorg/packages/container/brandos/settings → Change visibility → Public"
echo "     (Coolify pulls the image anonymously; while it is private every deploy fails)"
echo "  1. Coolify → brandos → Persistent Storage → add volume, destination /app/.data (keeps uploads)"
echo "  2. Cloudflare → thatha.net → DNS → A record  pm.work → 173.249.4.108  (DNS only, grey cloud)"
echo "  3. GitHub repo secrets COOLIFY_TOKEN and COOLIFY_APP_UUID=$COOLIFY_APP_UUID for auto-deploy on push"
