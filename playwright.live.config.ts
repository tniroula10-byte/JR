import { defineConfig, devices } from '@playwright/test';

/**
 * Live-database E2E: the real app against a local Supabase stack.
 * Requires `npx supabase start`, migrations applied, the Boss seeded, and the
 * local keys exported (see tests/e2e-live/flows.spec.ts). Run: npm run test:e2e:live
 */
export default defineConfig({
  testDir: './tests/e2e-live',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'chrome'
  },
  webServer: {
    command: 'NEXT_DIST_DIR=.next-live npx next dev -p 3200',
    url: 'http://localhost:3200/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
