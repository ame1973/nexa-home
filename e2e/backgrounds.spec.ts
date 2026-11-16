import { test, expect, seed, post } from "./fixtures";
import { accessibility, layoutAndTargets } from "./accessibility";
import { settingsInput } from "../apps/web/src/lib/forms";
import type { Settings } from "../apps/web/src/lib/api/client";
import type { Page } from "@playwright/test";

async function picture(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 1400, 900);
    gradient.addColorStop(0, "#075a91");
    gradient.addColorStop(0.5, "#e37661");
    gradient.addColorStop(1, "#282f84");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1400, 900);
    context.fillStyle = "#f5d08a";
    context.beginPath();
    context.arc(1040, 340, 225, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#0d4b63";
    context.beginPath();
    context.moveTo(0, 750);
    context.lineTo(510, 380);
    context.lineTo(880, 750);
    context.lineTo(1400, 500);
    context.lineTo(1400, 900);
    context.lineTo(0, 900);
    context.fill();
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  return {
    name: "background.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}

const currentSettings = async (page: Page, url: string) =>
  (await (
    await page.request.get(`${url}/api/v1/admin/settings`)
  ).json()) as Settings;

test("shared background previews, saves, survives backup restore and respects private access", async ({
  page,
  app,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const csrf = await seed(page, app);
  await page.goto(`${app.url}/admin/appearance`);
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
  const image = await picture(page);
  await page.locator('input[aria-label="Choose image"]').setInputFiles(image);
  await expect(
    page.getByRole("status").filter({ hasText: "Selected background" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tide", exact: true }).click();
  await page
    .getByRole("button", { name: "Centered gallery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview on page", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "preview",
  );
  expect((await currentSettings(page, app.url)).backgroundImage).toBe("");
  await page
    .getByRole("switch", { name: "Glass effects", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  await expect(
    page.getByRole("button", { name: "Tide", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("switch", { name: "Glass effects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview on page", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "preview",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  const saved = await currentSettings(page, app.url);
  expect(saved).toMatchObject({ themePreset: "tide", layoutPreset: "dune" });
  expect(saved.backgroundImage).toMatch(/^[a-f0-9]{64}$/);
  const imageURL = `${app.url}/api/v1/public/background/${saved.backgroundImage}`;
  expect((await page.request.get(imageURL)).status()).toBe(200);
  await page.goto(app.url);
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "site");
  await expect(page.locator("html")).toHaveAttribute(
    "data-layout-preset",
    "dune",
  );
  const material = await page
    .locator(".service-tile")
    .first()
    .evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      filter: getComputedStyle(element).backdropFilter,
    }));
  expect(material.background).toMatch(/rgba\(/);
  expect(material.filter).toContain("blur(");
  await layoutAndTargets(page);
  await accessibility(page);
  await page.screenshot({
    path: testInfo.outputPath("shared-glass-dark.png"),
    fullPage: true,
  });
  await page.evaluate(() => localStorage.setItem("nexa.theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await layoutAndTargets(page);
  await accessibility(page);
  await page.screenshot({
    path: testInfo.outputPath("shared-glass-light.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.glass = "false";
  });
  await expect
    .poll(() =>
      page
        .locator(".hero")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toContain("rgba(");
  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("no matching service");
  await expect(page.locator(".empty-state")).toBeVisible();
  expect(
    await page
      .locator(".empty-state")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await accessibility(page);
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("");
  await expect(page.locator(".collection").first()).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.glass = "true";
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
    ),
  ).toBe(true);
  for (const layout of ["future-glass", "graphite", "tide", "forest", "dune"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.layoutPreset = value;
    }, layout);
    for (const selector of [".hero", ".collection", ".service-tile"]) {
      const material = await page
        .locator(selector)
        .first()
        .evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          filter: getComputedStyle(element).backdropFilter,
        }));
      expect(material.filter, `${layout} ${selector}`).toBe("none");
      await expect
        .poll(
          () =>
            page
              .locator(selector)
              .first()
              .evaluate((element) => getComputedStyle(element).backgroundColor),
          { message: `${layout} ${selector}` },
        )
        .not.toContain("rgba(");
    }
  }
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "forced-colors", value: "active" }],
  });
  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
  ).toBe(true);
  expect(
    await page
      .locator(".service-tile")
      .first()
      .evaluate((element) => getComputedStyle(element).backdropFilter),
  ).toBe("none");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await cdp.detach();
  await page.waitForLoadState("networkidle");
  let safeRequests = 0;
  const countBackground = (request: { url(): string }) => {
    if (request.url().includes("/api/v1/public/background/")) safeRequests++;
  };
  page.on("request", countBackground);
  await page.goto(`${app.url}/?appearance=safe`);
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  await page.goto(`${app.url}/admin/appearance?appearance=safe`);
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".background-thumbnail")).toHaveCount(0);
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your appearance" }),
  ).toBeVisible();
  await expect(page.locator(".background-thumbnail")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  page.off("request", countBackground);
  expect(safeRequests).toBe(0);

  const backupResponse = await page.request.get(
    `${app.url}/api/v1/admin/backup/export?includeAssets=true`,
  );
  expect(backupResponse.status()).toBe(200);
  const backup = await backupResponse.json();
  expect(backup.version).toBe(4);
  expect(backup.background.base64).toBeTruthy();
  const removed = await page.request.put(`${app.url}/api/v1/admin/settings`, {
    data: { ...settingsInput(saved), backgroundUpload: null },
    headers: { Origin: app.url, "X-CSRF-Token": csrf },
  });
  expect(removed.status()).toBe(200);
  expect((await page.request.get(imageURL)).status()).toBe(404);
  const validation = await post(
    page.request,
    app,
    "/admin/backup/validate",
    backup,
    csrf,
  );
  expect(validation.status()).toBe(200);
  const { importToken } = await validation.json();
  const restored = await post(
    page.request,
    app,
    "/admin/backup/commit",
    { importToken, replace: true },
    csrf,
  );
  expect(restored.status()).toBe(200);
  expect((await currentSettings(page, app.url)).backgroundImage).toBe(
    saved.backgroundImage,
  );
  expect((await page.request.get(imageURL)).status()).toBe(200);
  const privateSettings = await currentSettings(page, app.url);
  expect(
    (
      await page.request.put(`${app.url}/api/v1/admin/settings`, {
        data: { ...settingsInput(privateSettings), accessMode: "private" },
        headers: { Origin: app.url, "X-CSRF-Token": csrf },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await post(page.request, app, "/auth/logout", {}, csrf)).status(),
  ).toBe(204);
  expect((await page.request.get(imageURL)).status()).toBe(401);
  await page.goto(`${app.url}/?appearance=safe`);
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("personal background is browser-local, previewable and removable without changing shared settings", async ({
  page,
  app,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "randomUUID", { value: undefined }),
  );
  await seed(page, app);
  await page.goto(app.url);
  const image = await picture(page);
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Your appearance" });
  await dialog.locator('input[aria-label="Choose image"]').setInputFiles(image);
  await expect(
    dialog.getByRole("status").filter({ hasText: "Selected background" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Graphite", exact: true }).click();
  await dialog.getByRole("button", { name: "Shelves", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Preview on page", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "preview",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("nexa.personalAppearance")),
  ).toBeNull();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "personal",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preset",
    "graphite",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-layout-preset",
    "forest",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nexa.personalAppearance")!),
  );
  expect(saved.background).toMatch(/^[a-f0-9-]{36}$/);
  expect(JSON.stringify(saved)).not.toContain("base64");
  expect((await currentSettings(page, app.url)).backgroundImage).toBe("");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "personal",
  );
  await page.goto(`${app.url}/?appearance=safe`);
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("nexa.personalAppearance")!).background,
    ),
  ).toBe(saved.background);
  await page.goto(app.url);
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "personal",
  );
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Your appearance" });
  await dialog
    .getByRole("button", { name: "No background image", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  expect(
    await page.evaluate(async (id) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("nexa-backgrounds", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result = await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction("images")
          .objectStore("images")
          .get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return result === undefined;
    }, saved.background),
  ).toBe(true);
});

test("browser storage failures preserve drafts and report unsuccessful image cleanup", async ({
  page,
  app,
}) => {
  await seed(page, app);
  await page.goto(app.url);
  const image = await picture(page);
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Your appearance" });
  await dialog.locator('input[aria-label="Choose image"]').setInputFiles(image);
  await expect(
    dialog.getByRole("status").filter({ hasText: "Selected background" }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => {
        throw new Error("blocked");
      },
    }),
  );
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("could not be saved");
  expect(
    await page.evaluate(() => localStorage.getItem("nexa.personalAppearance")),
  ).toBeNull();
  await page.evaluate(() => {
    Reflect.deleteProperty(indexedDB, "open");
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, "nexaOriginalSetItem", {
      configurable: true,
      value: original,
    });
    Storage.prototype.setItem = function (key, value) {
      if (key === "nexa.personalAppearance") throw new Error("blocked");
      original.call(this, key, value);
    };
  });
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("storage");
  expect(
    await page.evaluate(() => localStorage.getItem("nexa.personalAppearance")),
  ).toBeNull();
  const count = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nexa-backgrounds", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<number>((resolve, reject) => {
      const request = database
        .transaction("images")
        .objectStore("images")
        .count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return result;
  });
  expect(count).toBe(0);
  await page.evaluate(() => {
    Storage.prototype.setItem = (
      window as Window & {
        nexaOriginalSetItem?: typeof Storage.prototype.setItem;
      }
    ).nexaOriginalSetItem!;
    Reflect.deleteProperty(window, "nexaOriginalSetItem");
  });
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-wallpaper",
    "personal",
  );
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Your appearance" });
  await dialog
    .getByRole("button", { name: "No background image", exact: true })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => {
        throw new Error("blocked");
      },
    }),
  );
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(
    page.getByText(
      "An unused image could not be removed from browser storage.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-wallpaper", "none");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("nexa.personalAppearance")!).background,
    ),
  ).toBe("none");
  await page.evaluate(() => {
    Reflect.deleteProperty(indexedDB, "open");
  });
});
