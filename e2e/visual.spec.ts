import { accessibility, layoutAndTargets } from "./accessibility";
import { test, expect, seed, initialize, backup } from "./fixtures";

for (const width of [360, 390, 768, 1024, 1440])
  for (const theme of ["dark", "light"] as const) {
    test(`responsive ${width}px ${theme} homepage management and editor`, async ({
      page,
      app,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((theme) => {
        localStorage.setItem("nexa.theme", theme);
        localStorage.setItem("nexa.locale", "en");
      }, theme);
      await seed(page, app, 6);
      await page.goto(app.url);
      await expect(
        page.getByRole("searchbox", { name: "Search", exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await layoutAndTargets(page);
      await accessibility(page);
      if (width === 768) {
        const columns = await page
          .locator(".service-grid")
          .last()
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          );
        expect(columns).toBe(2);
      }
      await page.screenshot({
        path: testInfo.outputPath(`home-6-${width}-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("searchbox", { name: "Search", exact: true })
        .fill("家庭");
      await expect(page.getByRole("status")).toHaveText("1 results");
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`search-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.goto(`${app.url}/admin`);
      await expect(
        page.getByRole("heading", { name: "Dashboard", exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`admin-${width}-${theme}.png`),
        fullPage: true,
      });
      if (width < 1024) {
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await layoutAndTargets(page);
        await accessibility(page);
        await page.keyboard.press("Escape");
      }
      await page.goto(`${app.url}/admin/services/new`);
      await expect(
        page.getByRole("heading", { name: "New service", exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`editor-${width}-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Choose icon", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      await page.keyboard.press("Escape");
    });
  }
for (const theme of ["dark", "light"] as const) {
  test(`authentication and empty/100-service screenshots in ${theme}`, async ({
    page,
    app,
  }, testInfo) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("nexa.theme", theme);
    }, theme);
    await page.goto(`${app.url}/setup`);
    await expect(
      page.getByRole("heading", { name: "Set up your home" }),
    ).toBeVisible();
    await accessibility(page);
    await page.screenshot({
      path: testInfo.outputPath(`setup-${theme}.png`),
      fullPage: true,
    });
    await initialize(page, app);
    await page.goto(`${app.url}/login`);
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await accessibility(page);
    await page.screenshot({
      path: testInfo.outputPath(`login-${theme}.png`),
      fullPage: true,
    });
    for (const count of [0, 100]) {
      await seed(page, app, count);
      await page.goto(app.url);
      await expect(
        page.getByRole("searchbox", { name: "Search", exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await page.screenshot({
        path: testInfo.outputPath(`home-${count}-${theme}.png`),
        fullPage: true,
      });
    }
    await page.goto(`${app.url}/admin/backup`);
    await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
      name: "preview.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup(6))),
    });
    await page
      .getByRole("button", { name: "Validate backup", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    await layoutAndTargets(page);
    await accessibility(page);
    await page.screenshot({
      path: testInfo.outputPath(`backup-warning-${theme}.png`),
      fullPage: true,
    });
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
  });
}

test("system theme follows OS and glass/reduced-motion settings remain functional", async ({
  page,
  app,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("nexa.theme", "system"));
  const csrf = await seed(page, app, 6);
  const response = await page.request.get(`${app.url}/api/v1/admin/settings`);
  const {
    revision,
    updatedAt: _updatedAt,
    ...settings
  } = (await response.json()) as Record<string, unknown>;
  const saved = await page.request.put(`${app.url}/api/v1/admin/settings`, {
    data: { ...settings, expectedRevision: revision, glassEnabled: false },
    headers: { Origin: app.url, "X-CSRF-Token": csrf },
  });
  expect(saved.status()).toBe(200);
  await page.goto(app.url);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-glass", "false");
  expect(
    await page
      .locator(".site-header")
      .evaluate((element) => getComputedStyle(element).backdropFilter),
  ).toBe("none");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await accessibility(page);
  await page.getByRole("searchbox").press("/");
  await page.getByRole("searchbox").press("Escape");
  expect(
    await page
      .locator(".service-tile")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
});
