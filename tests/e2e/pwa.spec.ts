import { expect, test } from '@playwright/test';

test.use({ locale: 'es-ES' });

test('sin Drive solo se contacta el origen de la aplicación', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== new URL(baseURL!).origin) {
      foreign.push(req.url());
    }
  });
  await page.goto('/');
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
});

test('tras instalar el Service Worker, la app abre sin conexión', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Espera a que el precache termine (el aviso de «lista sin conexión» lo confirma).
  await expect(page.getByText('La aplicación está lista para funcionar sin conexión.')).toBeVisible(
    {
      timeout: 30_000,
    },
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await context.setOffline(false);
});

test('la aplicación distribuye su licencia AGPLv3 y los avisos de terceros', async ({
  request,
}) => {
  const own = await (await request.get('/LICENSE.txt')).text();
  expect(own).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
  expect(own).toContain('Version 3, 19 November 2007');

  const notices = await (await request.get('/THIRD-PARTY-NOTICES.txt')).text();
  expect(notices).toContain('@excalidraw/excalidraw 0.18.1 — MIT');
  expect(notices).toContain('Copyright (c) 2020 Excalidraw');
  expect(notices).toContain('Copyright (c) 2022 WorkOS');
  expect(notices).toContain('SIL OPEN FONT LICENSE Version 1.1');
  expect(notices).toContain('Fuente Virgil');
  // Liberation 1.05 no se distribuye (ver docs/licencias.md).
  expect(notices).not.toContain('Fuente Liberation');
  expect(
    (await request.get('/fonts/Liberation/LiberationSans-Regular.woff2')).headers()['content-type'],
  ).not.toContain('font');
});
