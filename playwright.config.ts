import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
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
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 }, launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium", launchOptions }, testMatch: /(responsive|customer-workflow)\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/about`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { APP_URL: `http://localhost:${PORT}` },
  },
});
