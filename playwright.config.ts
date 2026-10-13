import { defineConfig } from '@playwright/test';

const live = process.env.BHARAT_TEST_URL;
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 90_000 },
  reporter: 'list',
  outputDir: '.verification/playwright',
  use: {
    baseURL: live || 'http://127.0.0.1:5174',
    channel: 'chrome',
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: live ? undefined : {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174', reuseExistingServer: true,
    timeout: 30_000,
  },
});
