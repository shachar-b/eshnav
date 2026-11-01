import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const SYSTEM_CHROME_WIN = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const useChromeChannel = process.platform === 'win32' && existsSync(SYSTEM_CHROME_WIN);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    ...(useChromeChannel ? { channel: 'chrome' } : {}),
    headless: true,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    viewport: { width: 1366, height: 860 },
    trace: 'retain-on-failure',
  },
});
