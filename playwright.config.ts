import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    colorScheme: "dark",
    // Setup/session/import secrets must never enter trace or video artifacts.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
