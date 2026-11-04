import AxeBuilder from "@axe-core/playwright";
import { test, expect, seed, post, secretFill, password } from "./fixtures";
import { fixtureId } from "../apps/web/src/test/fixtures";
import { serviceInput } from "../apps/web/src/lib/forms";
import type { Service } from "../apps/web/src/lib/api/client";

test("category and tag editors handle collisions hidden groups and safe deletion", async ({
  page,
  app,
}) => {
  await seed(page, app, 6);
  await page.goto(`${app.url}/admin/categories`);
  await page.getByRole("button", { name: "Edit: Media", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("switch", { name: "Visible", exact: true }).uncheck();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.goto(app.url);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("link", { name: /Synology Photos/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Home Assistant/ })).toHaveCount(
    0,
  );
  await page.goto(`${app.url}/admin/tags`);
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Projects");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit: Projects", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("family");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("family");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Work");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Delete: Work", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit: Work", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${app.url}/admin/categories`);
  await page
    .getByRole("button", { name: "Delete: Media", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "They may become public",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit: Media", exact: true }),
  ).toHaveCount(0);
  await page.goto(app.url);
  await expect(
    page.getByRole("link", { name: /Synology Photos/ }).first(),
  ).toBeVisible();
});

test("desktop cross-category drag submits both complete scopes including hidden members", async ({
  page,
  app,
}) => {
  const csrf = await seed(page, app, 6);
  const original = await page.request.get(
    `${app.url}/api/v1/admin/services/${fixtureId(104)}`,
  );
  const hidden = serviceInput((await original.json()) as Service);
  hidden.isVisible = false;
  const updated = await page.request.put(
    `${app.url}/api/v1/admin/services/${fixtureId(104)}`,
    { data: hidden, headers: { Origin: app.url, "X-CSRF-Token": csrf } },
  );
  expect(updated.status()).toBe(200);
  const scopes: { categoryId: string | null; ids: string[] }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/admin/services/reorder")
      scopes.push(
        request.postDataJSON() as { categoryId: string | null; ids: string[] },
      );
  });
  await page.goto(`${app.url}/admin?view=services`);
  const source = page.getByRole("button", {
    name: "Drag to reorder: Synology Photos",
    exact: true,
  });
  const target = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: "Jellyfin", exact: true }) });
  await source.dragTo(target);
  await expect.poll(() => scopes.length).toBe(2);
  expect(
    scopes.find((scope) => scope.categoryId === fixtureId(1))?.ids,
  ).toEqual([fixtureId(104)]);
  expect(
    scopes.find((scope) => scope.categoryId === fixtureId(2))?.ids,
  ).toEqual([fixtureId(100), fixtureId(101), fixtureId(103)]);
  const saved = await page.request.get(
    `${app.url}/api/v1/admin/services/${fixtureId(100)}`,
  );
  expect(((await saved.json()) as Service).categoryId).toBe(fixtureId(2));
});

test("settings retain revision conflicts and password rotation revokes another real session", async ({
  page,
  app,
  browser,
}) => {
  const csrf = await seed(page, app, 6);
  await page.goto(`${app.url}/admin/appearance`);
  const title = page.getByRole("textbox", { name: "Site title", exact: true });
  await title.fill("Keep this unsaved title");
  const old = await page.request.get(`${app.url}/api/v1/admin/settings`);
  const {
    revision,
    updatedAt: _updatedAt,
    ...fields
  } = (await old.json()) as Record<string, unknown>;
  const outside = await page.request.put(`${app.url}/api/v1/admin/settings`, {
    data: {
      ...fields,
      expectedRevision: revision,
      siteSubtitle: "Changed in another session",
    },
    headers: { Origin: app.url, "X-CSRF-Token": csrf },
  });
  expect(outside.status()).toBe(200);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Settings changed in another session",
  );
  await expect(title).toHaveValue("Keep this unsaved title");
  await page
    .getByRole("button", { name: "Reload settings", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Reload settings", exact: true })
    .click();
  await expect(title).toHaveValue("Nexa Home");
  await expect(
    page.getByRole("textbox", { name: "Site subtitle", exact: true }),
  ).toHaveValue("Changed in another session");
  const other = await browser.newContext();
  try {
    const login = await post(other.request, app, "/auth/login", {
      username: "owner",
      password,
    });
    expect(login.status()).toBe(200);
    await page.goto(`${app.url}/admin/security`);
    const current = page.getByLabel("Current password", { exact: true });
    const next = page.getByLabel("New password", { exact: true });
    const confirm = page.getByLabel("Confirm password", { exact: true });
    await secretFill(current, "A wrong test password");
    await secretFill(next, "A replacement E2E password");
    await secretFill(confirm, "A replacement E2E password");
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "The current password is incorrect.",
    );
    await expect(current).toHaveValue("A wrong test password");
    await secretFill(current, password);
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "All sessions were revoked",
    );
    const rejected = await other.request.get(`${app.url}/api/v1/auth/me`);
    expect(rejected.status()).toBe(401);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations.map((item) => item.id)).toEqual([]);
  } finally {
    await other.close();
  }
});
