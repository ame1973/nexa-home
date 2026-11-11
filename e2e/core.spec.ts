import type { Page } from "@playwright/test";
import {
  test,
  expect,
  loginUI,
  password,
  username,
  secretFill,
  tabTo,
  seed,
  post,
  backup,
} from "./fixtures";

async function createWithKeyboard(page: Page, url: string, name: string) {
  const add = page
    .getByRole("link", { name: "Add service", exact: true })
    .first();
  await tabTo(page, add);
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(input).toBeVisible();
  await tabTo(page, input);
  await page.keyboard.type(name);
  await tabTo(page, page.getByLabel("Primary URL", { exact: true }));
  await page.keyboard.type(`${url}/healthz`);
  await tabTo(
    page,
    page.getByRole("button", { name: "Save changes", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Services", exact: true }),
  ).toBeVisible();
}

test("real first-run UI setup and login keep credentials out of persistent browser storage", async ({
  page,
  app,
}, testInfo) => {
  await page.goto(app.url);
  await expect(
    page.getByRole("heading", { name: "Set up your home" }),
  ).toBeVisible();
  const token = page.getByLabel("One-time setup token", { exact: true });
  await expect(token).toHaveAttribute("type", "password");
  await page.screenshot({
    path: testInfo.outputPath("setup-dark.png"),
    fullPage: true,
  });
  await secretFill(token, app.setupToken);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await secretFill(page.getByLabel("Password", { exact: true }), password);
  await secretFill(
    page.getByLabel("Confirm password", { exact: true }),
    password,
  );
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await secretFill(page.getByLabel("Password", { exact: true }), password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === "nexa_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  const stored = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(stored.includes(password) || stored.includes(app.setupToken)).toBe(
    false,
  );
  expect(JSON.stringify(app.logs).includes(password)).toBe(false);
});

test("keyboard-only service create edit reorder and delete work against the built Go app", async ({
  page,
  app,
}) => {
  await loginUI(page, app);
  await createWithKeyboard(page, app.url, "Keyboard One");
  await createWithKeyboard(page, app.url, "Keyboard Two");
  const up = page.getByRole("button", {
    name: "Move up: Keyboard Two",
    exact: true,
  });
  await tabTo(page, up);
  await page.keyboard.press("Enter");
  const table = page.getByRole("table", { name: "Services", exact: true });
  await expect(table.getByRole("link").first()).toHaveText("Keyboard Two");
  const edit = page.getByRole("link", { name: "Keyboard Two", exact: true });
  await tabTo(page, edit);
  await page.keyboard.press("Enter");
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toBeVisible();
  await tabTo(page, name);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Keyboard renamed");
  await tabTo(
    page,
    page.getByRole("button", { name: "Save changes", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Services", exact: true }),
  ).toBeVisible();
  const actions = page.getByRole("button", {
    name: "Actions: Keyboard renamed",
    exact: true,
  });
  await tabTo(page, actions);
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Delete", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await tabTo(
    page,
    dialog.getByRole("button", { name: "Delete", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "Keyboard renamed", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Keyboard One", exact: true }),
  ).toBeVisible();
});

test("backup UI validates previews confirms replacement and downloads a restorable file", async ({
  page,
  app,
}, testInfo) => {
  await loginUI(page, app);
  await page.goto(`${app.url}/admin/backup`);
  await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup(6))),
  });
  await page
    .getByRole("button", { name: "Validate backup", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", { name: "Replace the entire configuration?" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Replace configuration", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("backup-warning-dark.png"),
    fullPage: true,
  });
  await dialog
    .getByLabel("I understand this replaces the current configuration.", {
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Replace configuration", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Configuration restored.",
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const file = await downloaded;
  const stream = await file.createReadStream();
  const pieces: Buffer[] = [];
  for await (const piece of stream) pieces.push(Buffer.from(piece));
  const restored = JSON.parse(Buffer.concat(pieces).toString()) as {
    services: unknown[];
    assets: unknown[];
    admin?: unknown;
  };
  expect(restored.services).toHaveLength(6);
  expect(restored.admin).toBeUndefined();
  await page.goto(app.url);
  await expect(
    page.getByRole("searchbox", { name: "Search", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Synology Photos/ }).first(),
  ).toBeVisible();
});

test("uploaded cached icons remain local and icon dialog restores focus without CSP violations", async ({
  page,
  app,
}) => {
  await loginUI(page, app);
  await page.goto(`${app.url}/admin/services/new`);
  const choose = page.getByRole("button", { name: "Choose icon", exact: true });
  await choose.click();
  await page.getByRole("tab", { name: "Favicon", exact: true }).click();
  await page.getByLabel("Icon file", { exact: true }).setInputFiles({
    name: "cached.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#405B82"/></svg>',
    ),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(choose).toBeFocused();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Cached icon service");
  await page
    .getByLabel("Primary URL", { exact: true })
    .fill(`${app.url}/healthz`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Services", exact: true }),
  ).toBeVisible();
  await page.goto(app.url);
  const icon = page
    .getByRole("link", { name: /Cached icon service/ })
    .locator("img");
  await expect(icon).toHaveAttribute("src", /^\/assets\//);
  await expect(icon).toBeVisible();
});

test("JPEG icons keep their EXIF orientation through upload and backup restore", async ({
  page,
  app,
}) => {
  await loginUI(page, app);
  const jpeg = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 20;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 20, 20);
      context.fillStyle = "#0000ff";
      context.fillRect(20, 0, 20, 20);
      return canvas.toDataURL("image/jpeg", 0.95).split(",")[1]!;
    }),
    "base64",
  );
  const orientation = Buffer.from(
    "ffe1002245786966000049492a0008000000010012010300010000000600000000000000",
    "hex",
  );
  const photo = Buffer.concat([
    jpeg.subarray(0, 2),
    orientation,
    jpeg.subarray(2),
  ]);
  await page.goto(`${app.url}/admin/services/new`);
  await page.getByRole("button", { name: "Choose icon", exact: true }).click();
  await page.getByRole("tab", { name: "Upload", exact: true }).click();
  const file = page.getByLabel("Icon file", { exact: true });
  await expect(file).toHaveAttribute("accept", /image\/jpeg/);
  await file.setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/admin/assets" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const response = await uploaded;
  expect(response.status()).toBe(201);
  expect(((await response.json()) as { mimeType: string }).mimeType).toBe(
    "image/png",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("JPEG icon service");
  await page
    .getByLabel("Primary URL", { exact: true })
    .fill(`${app.url}/healthz`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Services", exact: true }),
  ).toBeVisible();

  const exported = await page.request.get(
    `${app.url}/api/v1/admin/backup/export`,
  );
  expect(exported.status()).toBe(200);
  const backupFile = (await exported.json()) as {
    assets: { mimeType: string; base64: string }[];
  };
  expect(backupFile.assets).toHaveLength(1);
  expect(backupFile.assets[0]!.mimeType).toBe("image/png");
  expect(
    Buffer.from(backupFile.assets[0]!.base64, "base64").subarray(0, 8),
  ).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
  await page.goto(`${app.url}/admin/backup`);
  await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFile)),
  });
  await page
    .getByRole("button", { name: "Validate backup", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByLabel("I understand this replaces the current configuration.", {
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Replace configuration", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Configuration restored.",
  );
  await page.goto(app.url);
  const icon = page
    .getByRole("link", { name: /JPEG icon service/ })
    .locator("img");
  await expect(icon).toBeVisible();
  await expect
    .poll(() =>
      icon.evaluate((element) => {
        const image = element as HTMLImageElement;
        return [image.naturalWidth, image.naturalHeight];
      }),
    )
    .toEqual([20, 40]);
  const colors = await icon.evaluate((element) => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0);
    const top = context.getImageData(10, 5, 1, 1).data;
    const bottom = context.getImageData(10, 35, 1, 1).data;
    return {
      topRed: top[0]!,
      topBlue: top[2]!,
      bottomRed: bottom[0]!,
      bottomBlue: bottom[2]!,
    };
  });
  expect(colors.topRed).toBeGreaterThan(colors.topBlue);
  expect(colors.bottomBlue).toBeGreaterThan(colors.bottomRed);
});

test("private mode hides data from a separate visitor and logout clears the authenticated page", async ({
  page,
  app,
  browser,
}) => {
  const csrf = await seed(page, app, 6);
  const response = await page.request.get(`${app.url}/api/v1/admin/settings`);
  const {
    revision,
    updatedAt: _updatedAt,
    ...fields
  } = (await response.json()) as Record<string, unknown>;
  const changed = await page.request.put(`${app.url}/api/v1/admin/settings`, {
    data: { ...fields, accessMode: "private", expectedRevision: revision },
    headers: { Origin: app.url, "X-CSRF-Token": csrf },
  });
  expect(changed.status()).toBe(200);
  const visitor = await browser.newContext({ locale: "en-US" });
  try {
    const anonymous = await visitor.newPage();
    await anonymous.goto(app.url);
    await expect(
      anonymous.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      (await anonymous.locator("body").innerText()).includes("Synology Photos"),
    ).toBe(false);
    const denied = await visitor.request.get(
      `${app.url}/api/v1/public/bootstrap`,
    );
    expect(denied.status()).toBe(401);
  } finally {
    await visitor.close();
  }
  await page.goto(`${app.url}/admin`);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    (await page.locator("body").innerText()).includes("Synology Photos"),
  ).toBe(false);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored.includes("Synology") || stored.includes("example.test")).toBe(
    false,
  );
});

test("invalid SVG is rejected by the real upload endpoint without executing in the browser", async ({
  page,
  app,
}) => {
  const csrf = await seed(page, app, 0);
  await page.goto(`${app.url}/admin/services/new`);
  await page.getByRole("button", { name: "Choose icon", exact: true }).click();
  await page.getByRole("tab", { name: "Upload", exact: true }).click();
  await page.getByLabel("Icon file", { exact: true }).setInputFiles({
    name: "active.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("forbidden")</script></svg>',
    ),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  const exported = await page.request.get(
    `${app.url}/api/v1/admin/backup/export`,
  );
  expect(
    ((await exported.json()) as { assets: unknown[] }).assets,
  ).toHaveLength(0);
  const malformed = await post(
    page.request,
    app,
    "/admin/backup/validate",
    { bad: true },
    csrf,
  );
  expect(malformed.status()).toBe(400);
});
