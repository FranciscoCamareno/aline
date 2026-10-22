import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Recorridos en navegador sobre la compilación de producción (vite preview).
 * Chromium automatizado NO certifica Safari en iPad ni el Apple Pencil (diseño §16.2).
 *
 * `pnpm test:e2e` usa Chromium (también en CI). `pnpm test:e2e:all` añade Microsoft Edge si está
 * instalado en el equipo: el diseño fija Chrome y Edge en Windows como navegadores de escritorio.
 */
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/opt/microsoft/msedge/msedge',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const edgeInstalled = EDGE_PATHS.some((p) => existsSync(p));

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  // En CI (máquinas más lentas y compartidas) un reintento: un fallo intermitente sale como
  // «flaky» en el informe en vez de tumbar la ejecución. En local, ninguno.
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // La bienvenida de la primera apertura ya está vista; su propio test parte de un perfil vacío.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [{ name: 'mindnote.welcome', value: '1' }],
        },
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(edgeInstalled
      ? [{ name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }]
      : []),
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
