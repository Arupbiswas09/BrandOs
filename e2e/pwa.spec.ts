import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("installable: manifest, icons and a controlling service worker", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("/");
  for (const icon of m.icons) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBeTruthy();
  }
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBeTruthy();

  await signIn(page);
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 15_000 }).toBeTruthy();
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBeTruthy();
});

test("offline shows the offline page, not a browser error", async ({ page, context }) => {
  await signIn(page);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBeTruthy();
  await context.setOffline(true);
  await page.goto("/library").catch(() => {});
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  await context.setOffline(false);
});

test("health check answers", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
  expect((await r.json()).ok).toBe(true);
});
