# BrandOS — production image.
#   docker build -t brandos .
#   docker run -p 3000:3000 -v brandos-data:/app/.data -e BRANDOS_ADMIN_EMAIL=you@agency.com -e BRANDOS_ADMIN_PASSWORD=... brandos
# Without DATABASE_URL it uses the built-in Postgres (PGlite) in /app/.data, so mount a volume there.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npx next build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# The commit being run, reported by /api/health (docker build --build-arg GIT_SHA=$(git rev-parse HEAD) .).
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA
RUN addgroup -S brandos && adduser -S brandos -G brandos
# curl is for the Coolify scheduled task that calls /api/cron/digest (docs/DEPLOY.md).
RUN apk add --no-cache curl
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations are read at start-up.
COPY --from=build /app/drizzle ./drizzle
# PGlite loads its WASM from node_modules at runtime.
COPY --from=build /app/node_modules/@electric-sql ./node_modules/@electric-sql
RUN mkdir -p .data && chown -R brandos:brandos .data
USER brandos
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
