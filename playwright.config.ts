import { defineConfig } from "@playwright/test";

const PORT = 3200;

/*
 * Runs against a throwaway database (PGLITE_DIR) so tests never touch your
 * local data. Uses the Chrome already installed on the machine; set
 * PW_CHANNEL= (empty) to use Playwright's bundled Chromium instead.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `rm -rf .data/pw && npx next build && PGLITE_DIR=.data/pw npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
