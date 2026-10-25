import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';

/**
 * Estilos del fondo del lienzo (plan 10.9): puntos, renglones o cuadrícula, guardados en el sidecar
 * de cada lienzo, pintados detrás del canvas del motor y exportados solo si se pide.
 */
test.use({ locale: 'es-ES' });

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('mindnote.welcome', '1'); // Bienvenida ya vista.
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

async function activeId(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  expect(id).toBeTruthy();
  return id!;
}

/** Sidecar de la cabeza vigente del lienzo (texto), leído de IndexedDB. */
async function sidecar(page: Page, documentId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = <T>(store: string, key: string) =>
      new Promise<T>((resolve) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result as T);
      });
    try {
      const doc = await get<{ headRevisionIds: string[] }>('documents', id);
      const rev = await get<{ contentRefs: { extensions: string | null } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      if (!rev.contentRefs.extensions) return '';
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.extensions);
      return new TextDecoder().decode(blob.bytes);
    } finally {
      db.close();
    }
  }, documentId);
}

const saved = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

async function pickPattern(page: Page, pattern: string) {
  await page.getByTestId('canvas-background').click();
  await page.getByTestId(`canvas-background-${pattern}`).click();
}

async function exportSvg(page: Page, withPattern: boolean): Promise<string> {
  await page.getByTestId('export-menu').click();
  await page.getByTestId('canvas-export').click();
  await page.getByTestId('export-format-svg').check();
  await expect(page.getByTestId('export-pattern')).not.toBeChecked();
  if (withPattern) await page.getByTestId('export-pattern').check();
  const download: Promise<Download> = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  return (await readFile((await (await download).path())!)).toString('utf8');
}

test('lienzo: elegir puntos, guardarlo en el sidecar, seguir la vista y exportarlo solo si se pide', async ({
  page,
}) => {
  await freshStart(page);
  const canvasId = await activeId(page);
  const host = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.mouse.click(host.x + 120, host.y + 560);
  await page.keyboard.press('r');
  await page.mouse.move(host.x + 300, host.y + 200);
  await page.mouse.down();
  await page.mouse.move(host.x + 460, host.y + 300, { steps: 8 });
  await page.mouse.up();
  await saved(page);

  const backdrop = page.locator('.canvas-backdrop');
  await expect(backdrop).toBeHidden();
  await pickPattern(page, 'dots');
  await expect(backdrop).toBeVisible();
  await expect
    .poll(() => backdrop.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toContain('radial-gradient');
  await saved(page);
  await expect.poll(() => sidecar(page, canvasId)).toContain('"background":{"pattern":"dots"}');

  // La capa sigue al desplazamiento del lienzo.
  const before = await backdrop.evaluate((el) => getComputedStyle(el).backgroundPosition);
  await page.mouse.move(host.x + 600, host.y + 400);
  await page.mouse.wheel(0, 130);
  await expect
    .poll(() => backdrop.evaluate((el) => getComputedStyle(el).backgroundPosition))
    .not.toBe(before);

  // SVG: sin la casilla, como siempre; con ella, el fondo y sus puntos debajo de los elementos.
  const plainSvg = await exportSvg(page, false);
  expect(plainSvg).not.toContain('data-aline-background');
  const dottedSvg = await exportSvg(page, true);
  expect(dottedSvg).toContain('data-aline-background="dots"');
  expect(dottedSvg).toContain('<circle');

  // Tras recargar sigue con puntos; en oscuro, la capa lleva el mismo filtro que el canvas.
  await page.reload();
  await expect(backdrop).toBeVisible();
  await page.getByRole('switch', { name: /tema oscuro/i }).click();
  await expect
    .poll(() => backdrop.evaluate((el) => getComputedStyle(el).filter))
    .toContain('invert');

  // Volver a liso quita la clave del sidecar y la capa.
  await pickPattern(page, 'plain');
  await expect(backdrop).toBeHidden();
  await saved(page);
  await expect.poll(() => sidecar(page, canvasId)).not.toContain('"background"');
});
