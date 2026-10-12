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
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await context.setOffline(false);
});
