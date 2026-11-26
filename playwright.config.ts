import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: browser → Next.js (3100) → NestJS API (3000) → PostgreSQL, plus the mock ERP (50000).
 * Run `npm run e2e`; it builds everything and Playwright starts the three servers below.
 * Stop local dev servers first: the API must run with NODE_ENV=test so tests can reset the data.
 */
const API = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // One shared database: tests run one after another and each starts from freshly seeded data.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/mock-erp/main.js',
      port: 50000,
      reuseExistingServer: false,
      env: { MOCK_ERP_PORT: '50000' },
    },
    {
      command: 'node dist/src/main.js',
      url: `${API}/docs`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        ERP_BASE_URL: 'http://127.0.0.1:50000/b1s/v1',
        SYNC_INTERVAL_MS: '0',
        SYNC_BACKOFF_MS: '0',
      },
    },
    {
      command: 'npm --prefix web run start',
      url: 'http://localhost:3100/login',
      reuseExistingServer: false,
    },
  ],
});
