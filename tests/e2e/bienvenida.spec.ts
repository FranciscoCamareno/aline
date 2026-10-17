import { expect, test } from '@playwright/test';

/** Bienvenida de la primera apertura: idioma y esquemas de color, y no vuelve a aparecer. */
test.use({ locale: 'es-ES', storageState: { cookies: [], origins: [] } });

test('la primera apertura pide idioma y tema, y luego no vuelve a salir', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByTestId('welcome-dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('combobox').selectOption('en');
  await expect(dialog.getByRole('heading', { name: 'Welcome to aline' })).toBeVisible();
  await dialog.getByTestId('scheme-blanco').click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'blanco');
  await page.getByTestId('welcome-continue').click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('save-status')).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
