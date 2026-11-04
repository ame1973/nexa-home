import { test, expect, seed, backup } from "./fixtures";
import { filterServices, searchIndex } from "../apps/web/src/lib/search";

test("1000-service search measures real input-to-paint p95 without per-keystroke requests", async ({
  page,
  app,
  browser,
}, testInfo) => {
  await seed(page, app, 1000);
  await page.goto(app.url);
  const search = page.getByRole("searchbox", { name: "Search", exact: true });
  await expect(search).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("1000 services");
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests++;
  });
  await page.evaluate(() => {
    const state = window as Window & { nexaLongTasks?: number[] };
    state.nexaLongTasks = [];
    new PerformanceObserver((list) => {
      state.nexaLongTasks?.push(
        ...list.getEntries().map((entry) => entry.duration),
      );
    }).observe({ type: "longtask" });
  });
  const fixture = backup(1000);
  const index = searchIndex(fixture);
  const samples: number[] = [];
  const terms = [
    "Service 99",
    "Jellyfin",
    "家庭",
    "AdGuard",
    "Home Assistant",
    "[literal]",
  ];
  for (let iteration = 0; iteration < 30; iteration++) {
    const term = terms[iteration % terms.length]!;
    const count = filterServices(index, term).length;
    await search.fill("");
    await expect(page.getByRole("status")).toHaveText("1000 services");
    await page.evaluate(
      ({ term, count }) => {
        const input = document.querySelector<HTMLInputElement>(
          'input[type="search"]',
        )!;
        const state = window as Window & { nexaSample?: number | null };
        state.nexaSample = null;
        input.addEventListener(
          "input",
          () => {
            const started = performance.now();
            const observer = new MutationObserver(() => {
              const status =
                document.querySelector('[role="status"]')?.textContent;
              const highlight = document
                .querySelector("mark")
                ?.textContent?.toLowerCase();
              if (
                status === `${count} results` &&
                (count === 0 || highlight === term.toLowerCase())
              ) {
                observer.disconnect();
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    state.nexaSample = performance.now() - started;
                  }),
                );
              }
            });
            observer.observe(document.querySelector("main")!, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          },
          { once: true, capture: true },
        );
      },
      { term, count },
    );
    await search.fill(term);
    await page.waitForFunction(
      () =>
        typeof (window as Window & { nexaSample?: number | null })
          .nexaSample === "number",
    );
    samples.push(
      await page.evaluate(
        () => (window as Window & { nexaSample?: number }).nexaSample!,
      ),
    );
  }
  samples.sort((a, b) => a - b);
  const tasks = await page.evaluate(
    () => (window as Window & { nexaLongTasks?: number[] }).nexaLongTasks ?? [],
  );
  const result = {
    services: 1000,
    samples: samples.length,
    metric:
      "native input event to a painted matching result, two animation frames after DOM commit",
    p50Ms: samples[Math.ceil(samples.length * 0.5) - 1]!,
    p95Ms: samples[Math.ceil(samples.length * 0.95) - 1]!,
    maxMs: samples.at(-1)!,
    longTaskCount: tasks.length,
    maxLongTaskMs: Math.max(0, ...tasks),
    apiRequestsDuringFiltering: requests,
    browser: browser.version(),
    viewport: page.viewportSize(),
  };
  await testInfo.attach("search-performance.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  console.log("Search performance:", JSON.stringify(result));
  expect(requests).toBe(0);
  expect(result.p95Ms).toBeLessThan(150);
  expect(result.maxLongTaskMs).toBeLessThan(200);
});
