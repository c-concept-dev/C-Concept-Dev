import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(here, "e2e"),
  outputDir: path.join(here, "test-results"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(here, "playwright-report"), open: "never" }],
    ["junit", { outputFile: path.join(here, "test-results", "junit.xml") }]
  ],
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris"
  },
  webServer: {
    command: "python3 -m http.server 8000 --bind 127.0.0.1",
    cwd: here,
    url: "http://127.0.0.1:8000/je-marche-comme-je-suis-p0.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android-chrome", use: { ...devices["Pixel 7"] } }
  ]
});
