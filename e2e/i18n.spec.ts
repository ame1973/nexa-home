import type { Page } from "@playwright/test";
import {
  test,
  expect,
  initialize,
  seed,
  tabTo,
  backup,
  password,
} from "./fixtures";
import { accessibility, layoutAndTargets } from "./accessibility";
import { localeRegistry, type Locale } from "../apps/web/src/locales";

async function chooseLanguage(page: Page, current: Locale, next: Locale) {
  await page
    .getByRole("button", {
      name: localeRegistry[current].messages.language,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitemradio", {
      name: localeRegistry[next].nativeName,
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", next);
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    localeRegistry[next].direction,
  );
}

const browserLocales: [string, Locale][] = [
  ["zh-TW", "zh-Hant"],
  ["zh-CN", "zh-Hans"],
  ["en-US", "en"],
  ["ja-JP", "ja"],
  ["ko-KR", "ko"],
  ["es-MX", "es"],
  ["fr-CA", "fr"],
  ["de-DE", "de"],
  ["pt-PT", "pt-BR"],
  ["ru-RU", "ru"],
  ["ar-SA", "ar"],
  ["hi-IN", "hi"],
];

for (const [browserLocale, locale] of browserLocales) {
  test.describe(`interface locale ${locale}`, () => {
    test.use({ locale: browserLocale });
    test("detects translates switches and persists on the built application", async ({
      page,
      app,
    }, testInfo) => {
      const messages = localeRegistry[locale].messages;
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(app.url);
      await expect(
        page.getByRole("heading", { name: messages.setup, exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        localeRegistry[locale].direction,
      );
      await layoutAndTargets(page);
      await initialize(page, app);
      await page.goto(`${app.url}/login`);
      await expect(
        page.getByRole("heading", { name: messages.signIn, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel(messages.username, { exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await seed(page, app, 6);
      await page.goto(app.url);
      await expect(
        page.getByRole("searchbox", { name: messages.search, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Synology Photos/ }).first(),
      ).toBeVisible();
      await layoutAndTargets(page);
      await accessibility(page);
      const themeButton = page.getByRole("button", {
        name: messages.themeStyles,
        exact: true,
      });
      await themeButton.click();
      const themeDialog = page.getByRole("dialog", {
        name: messages.personalAppearance,
        exact: true,
      });
      await themeDialog
        .getByRole("button", { name: messages.themeTide, exact: true })
        .click();
      await themeDialog
        .getByRole("button", { name: messages.customizeTheme, exact: true })
        .click();
      await themeDialog
        .getByRole("textbox", { name: messages.name, exact: true })
        .fill(`Theme ${locale}`);
      await expect(
        themeDialog.getByRole("combobox", {
          name: messages.themeRadius,
          exact: true,
        }),
      ).toHaveAttribute("dir", "ltr");
      await themeDialog
        .locator("summary")
        .filter({ hasText: messages.advancedCSS })
        .click();
      const cssEditor = themeDialog.getByRole("textbox", {
        name: messages.advancedCSS,
        exact: true,
      });
      await expect(cssEditor).toHaveAttribute("dir", "ltr");
      await cssEditor.fill("/* Browser-local presentation only. */");
      await layoutAndTargets(page);
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`themes-${locale}-390.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(themeDialog).toHaveCount(0);
      await expect(themeButton).toBeFocused();
      await page.screenshot({
        path: testInfo.outputPath(`home-${locale}-390.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: messages.language, exact: true })
        .click();
      await expect(page.getByRole("menuitemradio")).toHaveCount(12);
      for (const [code, definition] of Object.entries(localeRegistry)) {
        const item = page.getByRole("menuitemradio", {
          name: definition.nativeName,
          exact: true,
        });
        await expect(item.locator("bdi")).toHaveAttribute("lang", code);
        await expect(item.locator("bdi")).toHaveAttribute(
          "dir",
          definition.direction,
        );
      }
      await page.keyboard.press("Escape");
      const other: Locale = locale === "en" ? "zh-Hans" : "en";
      await chooseLanguage(page, locale, other);
      await chooseLanguage(page, other, locale);
      await page.reload();
      await expect(
        page.getByRole("searchbox", { name: messages.search, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => localStorage.getItem("nexa.locale")),
      ).toBe(locale);
      const stored = await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      );
      expect(
        stored.includes("Synology") ||
          stored.includes("example.test") ||
          stored.includes(password) ||
          stored.includes(app.setupToken),
      ).toBe(false);
      await page.goto(`${app.url}/admin/services/new`);
      await expect(
        page.getByRole("heading", { name: messages.newService, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel(messages.primaryUrl, { exact: true }),
      ).toHaveAttribute("dir", "ltr");
      await layoutAndTargets(page);
      await accessibility(page);
      await page
        .getByRole("button", { name: messages.chooseIcon, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("tab", { name: messages.upload, exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: messages.chooseIcon, exact: true }),
      ).toBeFocused();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`editor-${locale}-390.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await layoutAndTargets(page);
      await page.goto(`${app.url}/admin?view=services`);
      await expect(
        page.getByRole("table", { name: messages.services, exact: true }),
      ).toBeVisible();
      await layoutAndTargets(page);
    });
  });
}

test.describe("Arabic right-to-left interaction", () => {
  test.use({ locale: "ar-SA" });
  for (const width of [390, 1440]) {
    test(`mirrors navigation dialogs selects and switches at ${width}px`, async ({
      page,
      app,
    }, testInfo) => {
      const messages = localeRegistry.ar.messages;
      const theme = width === 390 ? "light" : "dark";
      await page.addInitScript(
        (theme) => localStorage.setItem("nexa.theme", theme),
        theme,
      );
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await seed(page, app, 6);
      await page.goto(`${app.url}/admin`);
      await expect(
        page.getByRole("heading", { name: messages.dashboard, exact: true }),
      ).toBeVisible();
      if (width < 1024) {
        const open = page.getByRole("button", {
          name: messages.openMenu,
          exact: true,
        });
        await tabTo(page, open);
        await page.keyboard.press("Enter");
        const sheet = page.getByRole("dialog");
        await expect(sheet).toHaveAttribute("data-side", "right");
        const bounds = await sheet.boundingBox();
        expect(bounds && Math.abs(bounds.x + bounds.width - width) < 1).toBe(
          true,
        );
        await layoutAndTargets(page);
        await accessibility(page);
        await page.screenshot({
          path: testInfo.outputPath("navigation-ar-390.png"),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
        await expect(open).toBeFocused();
      } else {
        const bounds = await page.locator("#admin-sidebar").boundingBox();
        expect(bounds && Math.abs(bounds.x + bounds.width - width) < 1).toBe(
          true,
        );
      }
      await page.goto(`${app.url}/admin/services/new`);
      const name = page.getByRole("textbox", {
        name: messages.name,
        exact: true,
      });
      const hint = page.getByText(messages.nameHint, { exact: true });
      expect(
        await hint.evaluate((element) => {
          const text = element.firstChild!;
          const start = text.textContent!.indexOf("1–80");
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, start + 1);
          const first = range.getBoundingClientRect().left;
          range.setStart(text, start + 2);
          range.setEnd(text, start + 4);
          return first < range.getBoundingClientRect().left;
        }),
        "RTL does not reverse the numeric safety range",
      ).toBe(true);
      await name.fill("خدمة NAS التجريبية");
      expect(
        await name.evaluate((element) => getComputedStyle(element).direction),
      ).toBe("rtl");
      const url = page.getByLabel(messages.primaryUrl, { exact: true });
      await url.fill(`${app.url}/healthz`);
      expect(
        await url.evaluate((element) => getComputedStyle(element).direction),
      ).toBe("ltr");
      const category = page.getByRole("combobox", {
        name: messages.category,
        exact: true,
      });
      await category.press("Enter");
      const options = page.getByRole("listbox");
      await expect(options).toBeVisible();
      expect(
        await page.evaluate(() => {
          const nonce = document.querySelector<HTMLMetaElement>(
            'meta[name="nexa-style-nonce"]',
          )?.content;
          const styles = [...document.querySelectorAll("style")].filter(
            (element) =>
              element.textContent?.includes("[data-radix-select-viewport]"),
          );
          return Boolean(
            nonce &&
            styles.length &&
            styles.every((element) => element.nonce === nonce),
          );
        }),
        "Select scrollbar styles use the current response nonce",
      ).toBe(true);
      expect(
        await options.evaluate(
          (element) => getComputedStyle(element).direction,
        ),
      ).toBe("rtl");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      const favorite = page.getByRole("switch", {
        name: messages.favorite,
        exact: true,
      });
      const thumb = favorite.locator('[data-slot="switch-thumb"]');
      const before = await thumb.boundingBox();
      await favorite.press("Space");
      await expect(favorite).toBeChecked();
      const after = await thumb.boundingBox();
      const track = await favorite.boundingBox();
      expect(before && after && after.x < before.x).toBe(true);
      expect(
        track &&
          after &&
          after.x >= track.x &&
          after.x + after.width <= track.x + track.width,
      ).toBe(true);
      const chooseIcon = page.getByRole("button", {
        name: messages.chooseIcon,
        exact: true,
      });
      await chooseIcon.click();
      const lucide = page.getByRole("tab", {
        name: messages.lucide,
        exact: true,
      });
      await lucide.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(
        page.getByRole("tab", { name: messages.upload, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowLeft");
      await expect(
        page.getByRole("tab", { name: messages.favicon, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await layoutAndTargets(page);
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`icon-dialog-ar-${width}.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(chooseIcon).toBeFocused();
      await tabTo(
        page,
        page.getByRole("button", { name: messages.save, exact: true }),
      );
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("table", { name: messages.services, exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute(
        "dir",
        "rtl",
      );
      const actions = page.getByRole("button", {
        name: `${messages.actions}: خدمة NAS التجريبية`,
        exact: true,
      });
      await actions.press("Enter");
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await menu.press("End");
      await expect(
        page.getByRole("menuitem", { name: messages.delete, exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByRole("alertdialog")).toContainText(
        messages.deleteServiceDescription,
      );
      await layoutAndTargets(page);
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: messages.cancel, exact: true })
        .click();
      await page.goto(`${app.url}/admin/backup`);
      await page
        .getByLabel(messages.backupFile, { exact: true })
        .setInputFiles({
          name: "locale-preview.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(backup(6))),
        });
      await page
        .getByRole("button", { name: messages.validateBackup, exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toContainText(
        messages.restoreDescription,
      );
      await layoutAndTargets(page);
      await accessibility(page);
      await page.screenshot({
        path: testInfo.outputPath(`backup-dialog-ar-${width}.png`),
        fullPage: true,
      });
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: messages.cancel, exact: true })
        .click();
      await chooseLanguage(page, "ar", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await page.goto(`${app.url}/admin`);
      if (width >= 1024) {
        const bounds = await page.locator("#admin-sidebar").boundingBox();
        expect(bounds?.x).toBe(0);
      }
      await layoutAndTargets(page);
    });
  }
});
