import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    channel: process.env.CI ? undefined : 'chrome'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' }
    }
  ],
  webServer: {
    command: 'JR_FORCE_MOCK=1 JR_ALLOW_DEMO_AUTH=1 JR_PERSIST_MOCK_FILE=1 npx next start -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  }
});
