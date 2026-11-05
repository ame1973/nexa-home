import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export async function layoutAndTargets(page: Page) {
  const result = await page.evaluate(() => {
    const failures: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,[role="option"],[role="menuitem"],[role="menuitemradio"]',
    )) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        element.matches(":disabled") ||
        element.closest('[aria-hidden="true"],[inert]')
      )
        continue;
      const label = element.closest("label");
      const target = label?.getBoundingClientRect() ?? rect;
      const name =
        element.getAttribute("aria-label") ??
        element.getAttribute("name") ??
        element.textContent?.trim().slice(0, 40) ??
        element.tagName;
      if (target.width < 43.5 || target.height < 43.5)
        failures.push(
          `${name}: ${Math.round(target.width)}x${Math.round(target.height)}`,
        );
      if (target.left < -0.5 || target.right > innerWidth + 0.5)
        failures.push(`${name}: outside viewport`);
    }
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      failures,
    };
  });
  expect(result.overflow, "horizontal page overflow").toBe(false);
  expect(result.failures, "44px visible targets inside the viewport").toEqual(
    [],
  );
}

export async function accessibility(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
