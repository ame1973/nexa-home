import { once } from "node:events";
import { createServer } from "node:http";
import { accessibility, layoutAndTargets } from "./accessibility";
import { test, expect, loginUI } from "./fixtures";

test("service health checks repeat, update the homepage, and resume after a trusted restore", async ({
  page,
  app,
}, testInfo) => {
  test.setTimeout(100_000);
  let status = 200;
  const checks: {
    at: number;
    method: string | undefined;
    cookie: boolean;
    authorization: boolean;
    referer: boolean;
  }[] = [];
  const target = createServer((request, response) => {
    checks.push({
      at: Date.now(),
      method: request.method,
      cookie: !!request.headers.cookie,
      authorization: !!request.headers.authorization,
      referer: !!request.headers.referer,
    });
    response.writeHead(status);
    response.end();
  });
  target.listen(0, "127.0.0.1");
  await once(target, "listening");
  try {
    const address = target.address();
    if (!address || typeof address === "string")
      throw new Error("No test health port");
    const targetURL = `http://127.0.0.1:${address.port}/readiness?probe=e2e`;
    let browserProbes = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).origin === new URL(targetURL).origin)
        browserProbes++;
    });

    await loginUI(page, app);
    await page.goto(`${app.url}/admin/services/new`);
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Monitored NAS");
    await page
      .getByLabel("Primary URL", { exact: true })
      .fill("https://nas.example.test");
    const toggle = page.getByRole("switch", {
      name: "Monitor this service",
      exact: true,
    });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.getByLabel("Health check URL", { exact: true }).fill(targetURL);
    const interval = page.getByLabel("Check interval (seconds)", {
      exact: true,
    });
    await expect(interval).toHaveValue("60");
    await interval.fill("30");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Services", exact: true }),
    ).toBeVisible();
    await expect.poll(() => checks.length).toBe(1);

    await page.setViewportSize({ width: 390, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(app.url);
    let tile = page.getByRole("link", { name: /Monitored NAS/ });
    await expect(tile.locator(".health-status")).toHaveText(/Available/);
    for (const name of ["Graphite", "Tide", "Forest", "Dune", "Future Glass"]) {
      await page
        .getByRole("button", { name: "Theme styles", exact: true })
        .click();
      const appearance = page.getByRole("dialog", { name: "Your appearance" });
      await appearance.getByRole("button", { name, exact: true }).click();
      await appearance
        .getByRole("button", { name: "Use in this browser", exact: true })
        .click();
      const status = tile.locator(".health-status");
      await expect(status).toHaveText(/Available/);
      const copy = await tile.locator(".tile-copy").boundingBox();
      const badge = await status.boundingBox();
      expect(copy).not.toBeNull();
      expect(badge).not.toBeNull();
      expect(badge!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height - 1);
      await layoutAndTargets(page);
      await accessibility(page);
    }
    await layoutAndTargets(page);
    await accessibility(page);
    await page.screenshot({
      path: testInfo.outputPath("health-home-en-390.png"),
      fullPage: true,
    });

    status = 503;
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "العربية", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(tile.locator(".health-status")).toHaveText(/متاح/);
    await layoutAndTargets(page);
    await accessibility(page);
    await page.screenshot({
      path: testInfo.outputPath("health-home-ar-390.png"),
      fullPage: true,
    });

    await page.goto(`${app.url}/admin?view=services`);
    await page
      .getByRole("link", { name: "Monitored NAS", exact: true })
      .click();
    await expect(
      page.getByLabel("عنوان فحص الحالة", { exact: true }),
    ).toHaveAttribute("dir", "ltr");
    await expect(
      page.getByLabel("الفاصل بين الفحوص (بالثواني)", { exact: true }),
    ).toHaveAttribute("dir", "ltr");
    await layoutAndTargets(page);
    await accessibility(page);
    await page.screenshot({
      path: testInfo.outputPath("health-editor-ar-390.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "اللغة", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "English", exact: true })
      .click();
    await page.goto(app.url);
    tile = page.getByRole("link", { name: /Monitored NAS/ });
    await expect
      .poll(() => checks.length, { timeout: 45_000 })
      .toBeGreaterThanOrEqual(2);
    expect(checks[1]!.at - checks[0]!.at).toBeGreaterThanOrEqual(29_500);
    await expect(tile.locator(".health-status")).toHaveText(/Unavailable/, {
      timeout: 25_000,
    });

    const bootstrapResponse = await page.request.get(
      `${app.url}/api/v1/public/bootstrap`,
    );
    expect(bootstrapResponse.status()).toBe(200);
    const publicBootstrap = await bootstrapResponse.text();
    expect(publicBootstrap).not.toContain(targetURL);
    const publicHealth = await page.request.get(
      `${app.url}/api/v1/public/health`,
    );
    expect(publicHealth.status()).toBe(200);
    expect(await publicHealth.text()).not.toContain(targetURL);
    const exported = await page.request.get(
      `${app.url}/api/v1/admin/backup/export`,
    );
    expect(exported.status()).toBe(200);
    const backup = (await exported.json()) as {
      version: number;
      services: {
        name: string;
        healthCheck?: { url: string; intervalSeconds: number };
      }[];
    };
    expect(backup.version).toBe(3);
    expect(
      backup.services.find((service) => service.name === "Monitored NAS")
        ?.healthCheck,
    ).toEqual({ url: targetURL, intervalSeconds: 30 });

    await page.goto(`${app.url}/admin?view=services`);
    await page
      .getByRole("link", { name: "Monitored NAS", exact: true })
      .click();
    await page
      .getByRole("switch", { name: "Monitor this service", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Services", exact: true }),
    ).toBeVisible();
    await page.goto(app.url);
    tile = page.getByRole("link", { name: /Monitored NAS/ });
    await expect(tile.locator(".health-status")).toHaveCount(0);
    const disabledHealth = await page.request.get(
      `${app.url}/api/v1/public/health`,
    );
    expect(await disabledHealth.json()).toEqual([]);

    await page.goto(`${app.url}/admin/backup`);
    await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
      name: "trusted-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page
      .getByRole("button", { name: "Validate backup", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      "Restored health checks will contact their configured addresses. Restore only trusted backups.",
    );
    await dialog
      .getByLabel("I understand this replaces the current configuration.", {
        exact: true,
      })
      .check();
    const beforeRestore = checks.length;
    await dialog
      .getByRole("button", { name: "Replace configuration", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => checks.length).toBeGreaterThan(beforeRestore);
    await page.goto(app.url);
    tile = page.getByRole("link", { name: /Monitored NAS/ });
    await expect(tile.locator(".health-status")).toHaveText(/Unavailable/);

    expect(browserProbes).toBe(0);
    for (const check of checks) {
      expect(check).toMatchObject({
        method: "GET",
        cookie: false,
        authorization: false,
        referer: false,
      });
    }
    expect(JSON.stringify(app.logs)).not.toContain(targetURL);
  } finally {
    await new Promise<void>((resolve, reject) =>
      target.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
