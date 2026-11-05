import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  bootstrap,
  fixtureServices,
  stamp,
} from "../apps/web/src/test/fixtures";

export const username = "owner";
export const password = "Only for Nexa Home E2E tests";
export type App = {
  url: string;
  setupToken: string;
  logs: Record<string, unknown>[];
};
export const test = base.extend<{ app: App; browserErrors: string[] }>({
  app: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "nexa-e2e-"));
    await chmod(directory, 0o700);
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const address = probe.address();
    if (!address || typeof address === "string")
      throw new Error("No local test port");
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
    const url = `http://127.0.0.1:${port}`;
    const child = spawn(resolve("bin/nexa-home"), [], {
      env: {
        ...process.env,
        NEXA_DATA_DIR: directory,
        NEXA_LISTEN: `127.0.0.1:${port}`,
        NEXA_PUBLIC_ORIGIN: url,
        NEXA_ALLOW_HTTP_COOKIE: "true",
        NEXA_TRUSTED_PROXY_CIDRS: "",
        NEXA_LOG_LEVEL: "info",
        TZ: "UTC",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    const exit = once(child, "exit");
    let buffer = "";
    let setupToken = "";
    const logs: Record<string, unknown>[] = [];
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Local application did not become ready")),
        10_000,
      );
      child.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("Could not launch the built application"));
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Local application exited during startup"));
      });
      child.stderr.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (typeof event.setupToken === "string") {
            setupToken = event.setupToken;
            delete event.setupToken;
          }
          logs.push(event);
          if (event.msg === "listening") {
            clearTimeout(timeout);
            resolve();
          }
        }
      });
    });
    try {
      await ready;
      // The startup credential is consumed only inside this owned fixture. It is
      // never printed, attached to a report, or saved as browser storage state.
      if (!/^[A-Za-z0-9_-]{43}$/.test(setupToken))
        throw new Error("Missing first-run test credential");
      await use({ url, setupToken, logs });
    } finally {
      child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      await exit;
      clearTimeout(timeout);
      await rm(directory, { recursive: true, force: true });
    }
  },
  browserErrors: [
    async ({ page, app }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.name));
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /Content Security Policy|violates.*directive/.test(message.text())
        )
          errors.push("Content Security Policy");
      });
      page.on("request", (request) => {
        const target = new URL(request.url());
        if (
          ["http:", "https:"].includes(target.protocol) &&
          target.origin !== app.url
        )
          errors.push("Unexpected non-local request");
      });
      await page.addInitScript(() => {
        const state = window as Window & { nexaCSPViolations?: string[] };
        state.nexaCSPViolations = [];
        window.addEventListener("securitypolicyviolation", (event) => {
          const source = new URL(event.sourceFile || location.href).pathname;
          state.nexaCSPViolations?.push(
            `${event.effectiveDirective} ${source}:${event.lineNumber}`,
          );
        });
      });
      await use(errors);
      const violations = await page
        .evaluate(
          () =>
            (window as Window & { nexaCSPViolations?: string[] })
              .nexaCSPViolations ?? [],
        )
        .catch(() => []);
      expect(violations, "production CSP violations").toEqual([]);
      expect(errors, "uncaught browser exceptions").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function secretFill(locator: Locator, value: string) {
  try {
    await locator.fill(value);
  } catch {
    throw new Error("The secret input could not be filled");
  }
}
export async function post(
  request: APIRequestContext,
  app: App,
  path: string,
  data: unknown,
  csrf = "",
) {
  try {
    return await request.post(`${app.url}/api/v1${path}`, {
      data,
      headers: { Origin: app.url, ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
    });
  } catch {
    throw new Error("The local API request could not be completed");
  }
}
export async function initialize(page: Page, app: App) {
  const status = await page.request.get(`${app.url}/api/v1/setup/status`);
  if (((await status.json()) as { initialized: boolean }).initialized) return;
  const response = await post(page.request, app, "/setup", {
    token: app.setupToken,
    username,
    password,
  });
  expect(response.status()).toBe(201);
}
export async function loginAPI(page: Page, app: App) {
  await initialize(page, app);
  const response = await post(page.request, app, "/auth/login", {
    username,
    password,
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}
export async function loginUI(page: Page, app: App) {
  await initialize(page, app);
  await page.goto(`${app.url}/login`);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await secretFill(page.getByLabel("Password", { exact: true }), password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
export function backup(count = 6) {
  return {
    format: "nexa-home-backup",
    version: 1,
    exportedAt: stamp,
    ...bootstrap,
    services: fixtureServices(count),
    assets: [],
  };
}
export async function seed(page: Page, app: App, count = 6) {
  const csrf = await loginAPI(page, app);
  const validated = await post(
    page.request,
    app,
    "/admin/backup/validate",
    backup(count),
    csrf,
  );
  expect(validated.status()).toBe(200);
  const importToken = ((await validated.json()) as { importToken: string })
    .importToken;
  const restored = await post(
    page.request,
    app,
    "/admin/backup/commit",
    { importToken, replace: true },
    csrf,
  );
  expect(restored.status()).toBe(200);
  return csrf;
}
export async function tabTo(page: Page, locator: Locator) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await locator.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("The target control is not reachable by keyboard");
}
