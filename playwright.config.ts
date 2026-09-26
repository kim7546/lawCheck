import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
      },
    },
  ],
  webServer: [
    { name: 'api', url: 'http://127.0.0.1:4000/api/v1/health' },
    { name: 'fo', url: 'http://127.0.0.1:5173' },
    { name: 'bo', url: 'http://127.0.0.1:5174' },
    { name: 'admin', url: 'http://127.0.0.1:5175/' },
  ].map(({ name, url }) => ({
    command: `npm run dev -w @lawcheck/${name}`,
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  })),
});
