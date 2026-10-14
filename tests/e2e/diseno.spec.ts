import { expect, test, type Page } from '@playwright/test';

/**
 * Sistema de diseño en el lienzo (docs/DESIGN.md §3.4): la selección es agua (pre-invertida en
 * oscuro) y el fondo oscuro sale del filtro del motor aplicado al papel. Si una actualización de
 * Excalidraw cambia el filtro, esta prueba lo detecta. Mide Chromium, no Safari.
 */
test.use({ locale: 'es-ES' });

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.removeItem('mindnote.theme');
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs
        .filter((d) => d.name?.startsWith('mindnote'))
        .map(
          (d) =>
            new Promise((resolve) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
            }),
        ),
    );
  });
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
}

const selectionColor = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.querySelector('.excalidraw')!)
      .getPropertyValue('--color-selection')
      .trim()
      .toLowerCase(),
  );

/** Color de un píxel de la pantalla (con el filtro CSS ya aplicado), lejos de la interfaz. */
async function screenPixel(page: Page): Promise<string> {
  const box = (await page.locator('.excalidraw canvas.interactive').boundingBox())!;
  const png = await page.screenshot({
    clip: { x: box.x + box.width / 2, y: box.y + box.height - 120, width: 4, height: 4 },
  });
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
    return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, '0')).join('')}`;
  }, png.toString('base64'));
}

const distance = (a: string, b: string) =>
  Math.max(
    ...[1, 3, 5].map((i) =>
      Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)),
    ),
  );

test('claro: selección agua profunda y fondo papel; oscuro: agua pre-invertida y fondo noche', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await freshStart(page);
  const toggle = page.getByRole('switch', { name: 'Tema oscuro' });
  // Sin preferencia, sigue al sistema (claro en esta prueba).
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.excalidraw')).not.toHaveClass(/theme--dark/);
  expect(await selectionColor(page)).toBe('#3f7f88');
  expect(distance(await screenPixel(page), '#fffdf4')).toBeLessThanOrEqual(2);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.excalidraw')).toHaveClass(/theme--dark/);
  expect(await selectionColor(page)).toBe('#00515a');
  // El filtro del motor (invert 93 % + hue-rotate 180°) convierte el papel en «noche».
  expect(distance(await screenPixel(page), '#16140c')).toBeLessThanOrEqual(3);

  // El interruptor pasa a modo manual: se recuerda en este navegador.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // «Seguir al sistema» está en Preferencias y vuelve al tema del sistema.
  await page.getByTestId('open-preferences').click();
  const follow = page.getByTestId('theme-system');
  await expect(follow).not.toBeChecked();
  await follow.check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('mindnote.theme'))).toBeNull();
  // Tocar el interruptor desactiva «Seguir al sistema».
  await toggle.click();
  await expect(follow).not.toBeChecked();
});
