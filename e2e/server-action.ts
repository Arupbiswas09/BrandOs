import { existsSync, readFileSync, statSync } from "node:fs";
import type { Page } from "@playwright/test";

/*
 * Calls a server action the way the browser does, so a test can check that
 * the server refuses something even when the interface no longer offers it.
 * The action's id comes from the build's manifest (production or dev server).
 */

const MANIFESTS = [".next/server/server-reference-manifest.json", ".next/dev/server/server-reference-manifest.json"];

type Manifest = { node: Record<string, { filename?: string; exportedName?: string }> };

function actionId(file: string, name: string): string | null {
  // The newest manifest belongs to the server that is running.
  const found = MANIFESTS.filter((m) => existsSync(m)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const m of found) {
    const { node } = JSON.parse(readFileSync(m, "utf8")) as Manifest;
    const hit = Object.entries(node).find(([, v]) => v.exportedName === name && v.filename?.endsWith(file));
    if (hit) return hit[0];
  }
  return null;
}

/**
 * Posts `args` to the server action `name` exported from `file` (for example
 * "app/actions.ts"), from the page at `path`, as the person signed in on
 * `page`. Returns the raw response text, which holds the action's Result.
 */
export async function callAction(page: Page, path: string, file: string, name: string, args: unknown[]): Promise<string> {
  // Visiting the page first makes sure a dev server has compiled the action.
  await page.goto(path);
  const id = actionId(file, name);
  if (!id) throw new Error(`No server action ${name} in ${file}`);
  const res = await page.request.post(path, {
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: new URL(page.url()).origin },
    data: JSON.stringify(args),
  });
  return res.text();
}
