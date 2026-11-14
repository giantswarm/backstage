import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'date-component.spec.ts',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6007',
    locale: 'en-US',
    timezoneId: 'Europe/Paris',
    viewport: { width: 800, height: 260 },
    screenshot: 'only-on-failure',
  },
  outputDir: '../node_modules/.cache/date-component-browser',
});
