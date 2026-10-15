import { expect, test, type Page } from '@playwright/test';

/**
 * Los stickers conservan su color en el tema oscuro (DESIGN.md, «Selector de stickers»): se mide
 * el color mostrado en pantalla, no el guardado. El filtro del motor (`invert + hue-rotate`) no
 * puede mostrar un amarillo saturado, así que la capa de stickers los dibuja fuera del filtro.
 * Si una actualización de Excalidraw cambia cómo compone los elementos, esta prueba lo detecta.
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
  await expect(page.getByTestId('tool-tray')).toBeVisible();
}

/** Inserta un sticker sin giro: el giro aleatorio desplazaría los píxeles que se comparan. */
async function insertStraight(page: Page, name: string) {
  await page.getByTestId('tool-sticker').click();
  await page.evaluate(() => {
    (window as unknown as { __random: () => number }).__random = Math.random;
    Math.random = () => 0.5; // giro = 0
  });
  await page.getByTestId(`sticker-${name}`).click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
}

/**
 * Color que se ve en pantalla frente al del archivo, sobre los píxeles saturados del sticker
 * situado en el centro de la vista.
 */
async function displayedVersusOriginal(page: Page) {
  // Sin selección: el cuadro y los tiradores no tapan el sticker.
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);

  const box = (await page.locator('.excalidraw canvas.interactive').boundingBox())!;
  const clip = {
    x: Math.round(box.x + box.width / 2 - 60),
    y: Math.round(box.y + box.height / 2 - 60),
    width: 120,
    height: 120,
  };
  const shot = await page.screenshot({ clip });
  return page.evaluate(
    async ({ base64 }) => {
      const read = async (blob: Blob, size: number) => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, size, size);
        return ctx.getImageData(0, 0, size, size).data;
      };
      const shown = await read(await (await fetch(`data:image/png;base64,${base64}`)).blob(), 120);
      // El PNG original es el que guardó el almacén (en producción la ruta del archivo de la
      // marca lleva un hash): el único blob de imagen de este almacén recién creado.
      const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const req = indexedDB.open('mindnote-vault');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction('blobs').objectStore('blobs').getAll();
          all.onsuccess = () => {
            const png = (all.result as Array<{ mimeType: string; bytes: Uint8Array }>).find((b) =>
              b.mimeType.startsWith('image/png'),
            );
            db.close();
            if (png) resolve(png.bytes);
            else reject(new Error('sin PNG en el almacén'));
          };
        };
      });
      const original = await read(new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }), 120);
      const diffs: number[] = [];
      for (let i = 0; i < original.length; i += 4) {
        const [r, g, b, a] = [original[i]!, original[i + 1]!, original[i + 2]!, original[i + 3]!];
        // Solo píxeles opacos y con color (el borde de papel y la tinta no importan aquí).
        if (a < 255 || Math.max(r, g, b) - Math.min(r, g, b) < 60) continue;
        diffs.push(
          Math.max(
            Math.abs(shown[i]! - r),
            Math.abs(shown[i + 1]! - g),
            Math.abs(shown[i + 2]! - b),
          ),
        );
      }
      diffs.sort((x, y) => x - y);
      return { count: diffs.length, median: diffs[Math.floor(diffs.length / 2)] ?? 255 };
    },
    { base64: shot.toString('base64') },
  );
}

for (const [scheme, name] of [
  ['dark', 'a'],
  ['dark', 'corazon'],
  ['light', 'a'],
] as const) {
  test(`el sticker «${name}» conserva su color en tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await freshStart(page);
    await insertStraight(page, name);
    const result = await displayedVersusOriginal(page);
    // Hay un buen número de píxeles de color y casi todos coinciden con el archivo.
    expect(result.count).toBeGreaterThan(300);
    expect(result.median).toBeLessThanOrEqual(8);
  });
}

test('al recargar, el sticker guardado se sigue viendo con su color en oscuro', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await freshStart(page);
  await insertStraight(page, 'a');
  await page.reload();
  await expect(page.getByTestId('tool-tray')).toBeVisible();
  // La imagen se recibe de la escena guardada, no de la inserción: tiene que reconocerse igual.
  await expect
    .poll(async () => (await displayedVersusOriginal(page)).median, { timeout: 15_000 })
    .toBeLessThanOrEqual(8);
});

test('cambiar de tema con un sticker en el lienzo lo mantiene fiel en los dos', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await freshStart(page);
  await insertStraight(page, 'a');
  await page.getByRole('switch', { name: 'Tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(async () => (await displayedVersusOriginal(page)).median, { timeout: 10_000 })
    .toBeLessThanOrEqual(8);
  await page.getByRole('switch', { name: 'Tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(async () => (await displayedVersusOriginal(page)).median, { timeout: 10_000 })
    .toBeLessThanOrEqual(8);
});
