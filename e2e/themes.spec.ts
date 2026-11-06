import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { test, expect, seed, post } from "./fixtures";
import { accessibility, layoutAndTargets } from "./accessibility";
import { settingsInput } from "../apps/web/src/lib/forms";
import type { Settings } from "../apps/web/src/lib/api/client";

const presets = [
  ["future-glass", "Future Glass"],
  ["graphite", "Graphite"],
  ["tide", "Tide"],
  ["forest", "Forest"],
  ["dune", "Dune"],
] as const;

for (const [preset, name] of presets)
  for (const mode of ["dark", "light"] as const) {
    test(`theme ${preset} ${mode}: real selection persistence contrast and responsive controls`, async ({
      page,
      app,
    }, testInfo) => {
      await page.setViewportSize({
        width: mode === "light" ? 390 : 1440,
        height: 1000,
      });
      await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
      await page.addInitScript((mode) => {
        localStorage.setItem("nexa.theme", mode);
        localStorage.setItem("nexa.locale", "en");
      }, mode);
      await seed(page, app);
      await page.goto(app.url);
      await expect(page.getByRole("searchbox")).toBeVisible();
      await page
        .getByRole("button", { name: "Theme styles", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Your appearance" });
      await dialog.getByRole("button", { name, exact: true }).click();
      await expect(
        dialog.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await layoutAndTargets(page);
      await accessibility(page);
      await dialog
        .getByRole("button", { name: "Use in this browser", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme-preset",
        preset,
      );
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      await layoutAndTargets(page);
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`home-${preset}-${mode}.png`),
        fullPage: true,
      });
      await page.reload();
      await expect(page.getByRole("searchbox")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme-preset",
        preset,
      );
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("nexa.personalAppearance")!)
              .themePreset,
        ),
      ).toBe(preset);
      await page.goto(`${app.url}/admin`);
      await expect(
        page.getByRole("heading", { name: "Dashboard", exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      await page.goto(`${app.url}/admin/services/new`);
      await expect(
        page.getByRole("heading", { name: "New service", exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      await page
        .getByRole("button", { name: "Choose icon", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      await page.keyboard.press("Escape");
    });
  }

test("custom themes use real token/CSS editing, Escape recovery, a browser library and separate downloads", async ({
  page,
  app,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, app);
  await page.goto(app.url);
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Your appearance" });
  await dialog.getByRole("button", { name: "Tide", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Customize a copy", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("My Homelab Tide");
  await dialog
    .getByRole("group", { name: "Light", exact: true })
    .getByRole("textbox", { name: "Accent color", exact: true })
    .fill("#006c73");
  await dialog
    .getByRole("combobox", { name: "Corner radius", exact: true })
    .selectOption("20");
  await dialog
    .getByRole("combobox", { name: "Shadow", exact: true })
    .selectOption("none");
  await dialog.locator("summary").filter({ hasText: "Advanced CSS" }).click();
  const editor = dialog.getByRole("textbox", {
    name: "Advanced CSS",
    exact: true,
  });
  await editor.fill("body { display:none !important; }");
  await dialog
    .getByRole("button", { name: "Preview on page", exact: true })
    .click();
  await expect(page.locator("body")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(editor).toHaveValue("body { display:none !important; }");
  await expect(page.locator("#nexa-custom-css")).toHaveCount(0);
  const css =
    "@layer personal { @media (min-width: 1px) { .service-tile { border-style: dashed !important; } } }";
  await editor.fill(css);
  await dialog
    .getByRole("button", {
      name: "Save to this browser's library",
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("nexa.themes")!).length,
    ),
  ).toBe(1);
  await layoutAndTargets(page);
  await accessibility(page);
  await page.screenshot({
    path: testInfo.outputPath("custom-theme-editor.png"),
    fullPage: true,
  });
  const jsonDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export theme JSON", exact: true })
    .click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toBe("nexa-home-theme.json");
  const definition = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(definition.name).toBe("My Homelab Tide");
  expect(definition).not.toHaveProperty("css");
  const cssDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export CSS file", exact: true })
    .click();
  const stylesheet = await cssDownload;
  expect(await readFile((await stylesheet.path())!, "utf8")).toBe(css);
  await dialog
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preset",
    "custom",
  );
  expect(
    await page
      .locator(".service-tile")
      .first()
      .evaluate((element) => getComputedStyle(element).borderTopStyle),
  ).toBe("dashed");
  expect(
    await page
      .locator(".service-tile")
      .first()
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("20px");
  await page.reload();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preset",
    "custom",
  );
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Your appearance" });
  await dialog.getByLabel("Import theme JSON", { exact: true }).setInputFiles({
    name: "theme.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(definition)),
  });
  await dialog
    .getByRole("button", { name: "Use imported theme", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("My Homelab Tide");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("shared arbitrary CSS has fresh nonces, cannot escape its style element, and cannot fetch external resources", async ({
  page,
  browser,
  app,
}) => {
  const csrf = await seed(page, app);
  let fetched = 0;
  const server = createServer((_request, response) => {
    fetched++;
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end("");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No owned probe port");
  const external = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext({ locale: "en-US" });
  let release: (() => void) | undefined;
  try {
    const css = `/* </style><script>window.themeInjected=true</script> */\n@import url("${external}/external.css");\n@font-face { font-family: ThemeProbe; src: url("${external}/font.woff2"); }\nbody { font-family: ThemeProbe, sans-serif; background-image: url("${external}/image.svg"); }\n.service-tile { border-style: dashed !important; }`;
    const current = (await (
      await page.request.get(`${app.url}/api/v1/admin/settings`)
    ).json()) as Settings;
    const saved = await page.request.put(`${app.url}/api/v1/admin/settings`, {
      data: { ...settingsInput(current), customCSS: css },
      headers: { Origin: app.url, "X-CSRF-Token": csrf },
    });
    expect(saved.status()).toBe(200);
    const probe = await context.newPage();
    const errors: string[] = [];
    probe.on("pageerror", (error) => errors.push(error.name));
    await probe.addInitScript(() => {
      const state = window as Window & {
        themeViolations?: { directive: string; uri: string }[];
      };
      state.themeViolations = [];
      window.addEventListener("securitypolicyviolation", (event) =>
        state.themeViolations?.push({
          directive: event.effectiveDirective,
          uri: event.blockedURI,
        }),
      );
    });
    const response = await probe.goto(app.url);
    await expect(probe.getByRole("searchbox")).toBeVisible();
    const nonce = await probe
      .locator("#nexa-custom-css")
      .evaluate((element) => (element as HTMLStyleElement).nonce);
    expect(nonce).toBe(
      await probe
        .locator('meta[name="nexa-style-nonce"]')
        .getAttribute("content"),
    );
    const policy = response!.headers()["content-security-policy"]!;
    expect(policy).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(policy.split(";").map((directive) => directive.trim())).toContain(
      "script-src 'self'",
    );
    expect(
      await probe.evaluate(
        () => (window as Window & { themeInjected?: boolean }).themeInjected,
      ),
    ).toBeUndefined();
    expect(
      await probe
        .locator(".service-tile")
        .first()
        .evaluate((element) => getComputedStyle(element).borderTopStyle),
    ).toBe("dashed");
    await expect
      .poll(
        async () =>
          (
            await probe.evaluate(
              () =>
                (
                  window as Window & {
                    themeViolations?: { directive: string; uri: string }[];
                  }
                ).themeViolations ?? [],
            )
          ).filter((event) => event.uri.startsWith(external)).length,
      )
      .toBeGreaterThanOrEqual(3);
    const directives = await probe.evaluate(() =>
      (
        (window as Window & { themeViolations?: { directive: string }[] })
          .themeViolations ?? []
      ).map((event) => event.directive),
    );
    expect(directives).toContain("font-src");
    expect(directives).toContain("img-src");
    expect(
      directives.some((directive) => directive.startsWith("style-src")),
    ).toBe(true);
    // Hold bootstrap on reload: cached presentation must already use this
    // response's nonce before any settings response can repair the first paint.
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await probe.route("**/api/v1/public/bootstrap", async (route) => {
      await pending;
      await route.continue();
    });
    await probe.reload({ waitUntil: "domcontentloaded" });
    const nextNonce = await probe
      .locator("#nexa-custom-css")
      .evaluate((element) => (element as HTMLStyleElement).nonce);
    expect(nextNonce).not.toBe(nonce);
    expect(nextNonce).toBe(
      await probe
        .locator('meta[name="nexa-style-nonce"]')
        .getAttribute("content"),
    );
    release!();
    await expect(probe.getByRole("searchbox")).toBeVisible();
    expect(fetched).toBe(0);
    expect(errors).toEqual([]);
    await probe.goto(`${app.url}/?appearance=safe`);
    await expect(probe.getByRole("searchbox")).toBeVisible();
    await expect(probe.locator("#nexa-custom-css")).toHaveCount(0);
    await expect(probe.locator("html")).toHaveAttribute(
      "data-safe-appearance",
      "true",
    );
    expect(fetched).toBe(0);
  } finally {
    release?.();
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("safe appearance recovers a hidden administrator UI without deleting settings or bypassing authentication", async ({
  page,
  app,
}) => {
  const csrf = await seed(page, app);
  const current = (await (
    await page.request.get(`${app.url}/api/v1/admin/settings`)
  ).json()) as Settings;
  const saved = await page.request.put(`${app.url}/api/v1/admin/settings`, {
    data: {
      ...settingsInput(current),
      themePreset: "forest",
      customCSS: "body { display:none!important; }",
    },
    headers: { Origin: app.url, "X-CSRF-Token": csrf },
  });
  expect(saved.status()).toBe(200);
  await page.goto(app.url);
  await expect(page.locator("body")).toBeHidden();
  await page.goto(`${app.url}/admin/appearance?appearance=safe`);
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preset",
    "future-glass",
  );
  await expect(page.locator("#nexa-custom-css")).toHaveCount(0);
  const unchanged = (await (
    await page.request.get(`${app.url}/api/v1/admin/settings`)
  ).json()) as Settings;
  expect(unchanged.customCSS).toBe("body { display:none!important; }");
  await page.locator("summary").filter({ hasText: "Advanced CSS" }).click();
  await page
    .getByRole("textbox", { name: "Advanced CSS", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Leave safe appearance", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-safe-appearance",
    "false",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preset",
    "forest",
  );
  const beforePrivate = (await (
    await page.request.get(`${app.url}/api/v1/admin/settings`)
  ).json()) as Settings;
  expect(
    (
      await page.request.put(`${app.url}/api/v1/admin/settings`, {
        data: { ...settingsInput(beforePrivate), accessMode: "private" },
        headers: { Origin: app.url, "X-CSRF-Token": csrf },
      })
    ).status(),
  ).toBe(200);
  const logout = await post(page.request, app, "/auth/logout", {}, csrf);
  expect(logout.status()).toBe(204);
  await page.evaluate(() =>
    localStorage.setItem(
      "nexa.appearance",
      JSON.stringify({
        themePreset: "custom",
        customTheme: { broken: true },
        customCSS: "body { display:none!important; }",
      }),
    ),
  );
  await page.goto(`${app.url}/admin/appearance?appearance=safe`);
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-safe-appearance",
    "true",
  );
  expect(
    (await page.request.get(`${app.url}/api/v1/admin/settings`)).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Theme styles", exact: true }).click();
  const recovery = page.getByRole("dialog", {
    name: "Your appearance",
    exact: true,
  });
  await expect(
    recovery.getByRole("button", { name: "Future Glass", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(recovery).toHaveCount(0);
  await layoutAndTargets(page);
  await accessibility(page);
});
