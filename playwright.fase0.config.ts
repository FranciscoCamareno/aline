import { defineConfig, devices } from '@playwright/test';

/** Pruebas de viabilidad de la fase 0 sobre el banco compilado (vite.spike.config.ts). */
export default defineConfig({
  testDir: 'tests/fase0',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'pnpm spike:fase0',
    url: 'http://localhost:4174',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
