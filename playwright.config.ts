import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** Second server with no AI providers configured, for the "not configured" checks. */
const PORT_UNCONFIGURED = PORT + 1;

// The main suite exercises the full workflow with the development mocks,
// explicitly enabled. They label every result "development mock, not AI".
const MOCK_AI = {
  IMAGE_ENHANCEMENT_PROVIDER: "mock",
  METADATA_PROVIDER: "mock",
  TRYON_PROVIDER: "mock",
  AI_ALLOW_MOCK_PROVIDERS: "true",
};
const NO_AI = { IMAGE_ENHANCEMENT_PROVIDER: "none", METADATA_PROVIDER: "none", TRYON_PROVIDER: "none", AI_ALLOW_MOCK_PROVIDERS: "false" };
const executablePath = process.env.PW_CHROMIUM ?? (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const launchOptions = { executablePath, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 }, launchOptions }, testIgnore: /not-configured/ },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, testIgnore: /not-configured/ },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium", launchOptions }, testMatch: /(responsive|customer-workflow)\.spec\.ts/ },
    {
      name: "unconfigured",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT_UNCONFIGURED}`, launchOptions },
      testMatch: /not-configured\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/about`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { APP_URL: `http://localhost:${PORT}`, ...MOCK_AI },
    },
    {
      command: `npx next start -p ${PORT_UNCONFIGURED}`,
      url: `http://localhost:${PORT_UNCONFIGURED}/about`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { APP_URL: `http://localhost:${PORT_UNCONFIGURED}`, ...NO_AI },
    },
  ],
});
