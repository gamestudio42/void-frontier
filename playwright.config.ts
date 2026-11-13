import { defineConfig, devices } from '@playwright/test';

/** Browser end-to-end tests against the dev server. Software GL keeps them runnable without a GPU. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    locale: 'en-US',
    // Most flows test Newtonian flight, so they launch with flight assist off; specs that
    // test a first launch clear this with their own storage state.
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://localhost:5199', localStorage: [{ name: 'void-frontier.settings', value: JSON.stringify({ startAssisted: false }) }] }],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @void-frontier/game dev --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
