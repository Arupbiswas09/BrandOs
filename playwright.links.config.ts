import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/*
 * The link-check tests open pages served by a tiny server on this machine.
 * A production build never opens private addresses, so these run against a
 * dev server with BRANDOS_ALLOW_PRIVATE_FETCH=1, on its own port, database
 * and build folder: npm run test:links. The main suite skips them.
 */
const PORT = 3201;
process.env.PW_LOCAL_FETCH = "1";
// Its own build folder, so it runs beside your dev server; e2e/server-action.ts reads action ids from it.
process.env.NEXT_DIST_DIR = ".next-pw-links";
process.env.CRON_SECRET ??= "pw-links-cron";

export default defineConfig({
  ...base,
  testMatch: /links-features\.spec\.ts/,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `rm -rf .data/pw-links && PGLITE_DIR=.data/pw-links BRANDOS_AUTH=demo BRANDOS_SEED=on BRANDOS_ALLOW_PRIVATE_FETCH=1 CRON_SECRET=${process.env.CRON_SECRET} npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
