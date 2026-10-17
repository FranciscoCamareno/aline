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
    localStorage.removeItem('mindnote.scheme.light');
    localStorage.removeItem('mindnote.scheme.dark');
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
  // «Seguir al sistema» está en Preferencias (Perfil → Preferencias) y vuelve al tema del sistema.
  await openPreferences(page);
  const follow = page.getByTestId('theme-system');
  await expect(follow).not.toBeChecked();
  await follow.check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('mindnote.theme'))).toBeNull();
  await page.getByTestId('settings-close').click();
  // Tocar el interruptor desactiva «Seguir al sistema».
  await toggle.click();
  await openPreferences(page);
  await expect(follow).not.toBeChecked();
});

/** Temas: Perfil (menú del pie) → Temas abre Configuración en Apariencia. */
async function openPreferences(page: Page) {
  await page.getByTestId('open-profile').click();
  await page.getByTestId('settings-appearance').click();
  await expect(page.getByTestId('settings-section-appearance')).toBeVisible();
}

/** Revisiones guardadas del lienzo inicial (el esquema no debe crear ninguna). */
const canvasRevisions = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
    });
    const req = db.transaction('revisions').objectStore('revisions').getAll();
    const all = await new Promise<Array<{ metadata: { kind: string } }>>(
      (resolve) => (req.onsuccess = () => resolve(req.result)),
    );
    db.close();
    return all.filter((r) => r.metadata.kind === 'canvas').length;
  });

test('esquemas: uno claro y uno oscuro elegidos, el lienzo los sigue sin guardar nada', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await freshStart(page);
  // Sin elección: Papel en claro.
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'papel');
  const before = await canvasRevisions(page);

  await openPreferences(page);
  await expect(page.getByTestId('scheme-papel')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('scheme-noche')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('scheme-bruma').click();
  await page.getByTestId('scheme-marea').click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'bruma');
  await page.getByTestId('settings-close').click();
  // Paneles y lienzo con el esquema: el fondo pintado es el de Bruma.
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim(),
    ),
  ).toBe('#e6f0f1');
  await expect
    .poll(async () => distance(await screenPixel(page), '#f6fafa'))
    .toBeLessThanOrEqual(2);

  // El interruptor alterna con el oscuro elegido (Marea): el filtro convierte bruma en marea.
  const toggle = page.getByRole('switch', { name: 'Tema oscuro' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'marea');
  await expect
    .poll(async () => distance(await screenPixel(page), '#141818'))
    .toBeLessThanOrEqual(3);

  // Se recuerda en este navegador y el lienzo no ha guardado ninguna versión nueva.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'marea');
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await canvasRevisions(page)).toBe(before);
});

test('Negro: el lienzo invierte al 100 % y llega a negro puro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await freshStart(page);
  await openPreferences(page);
  await page.getByTestId('scheme-negro').click();
  await page.getByTestId('settings-close').click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'negro');
  await expect
    .poll(async () => distance(await screenPixel(page), '#000000'))
    .toBeLessThanOrEqual(2);
});

test('modo Zen: oculta la barra lateral y la cabecera, y vuelven al salir', async ({ page }) => {
  await freshStart(page);
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('nav.library')).toBeVisible();
  await page.locator('.excalidraw canvas.interactive').click({ position: { x: 400, y: 300 } });
  await page.keyboard.press('Alt+z');
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.locator('nav.library')).toHaveCount(0);
  // Las herramientas del lienzo siguen ahí.
  await expect(page.getByTestId('tool-tray')).toBeVisible();
  await page.keyboard.press('Alt+z');
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('nav.library')).toBeVisible();
});
