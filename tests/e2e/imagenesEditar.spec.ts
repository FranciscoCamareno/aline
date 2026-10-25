import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

/**
 * Editar imágenes de los documentos (plan 10.8): tamaño con los tiradores o la barra, giro y
 * recorte sin tocar el original; Word recibe la imagen ya recortada y girada; en los documentos
 * Markdown, girar o recortar guarda una copia.
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

async function newDocument(page: Page, item: string) {
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: item }).click();
  await expect(page.getByTestId('doc-editor')).toBeFocused();
}

async function activeId(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  expect(id).toBeTruthy();
  return id!;
}

/** Cuerpo y archivos de la cabeza vigente, leídos de IndexedDB. */
async function head(page: Page, documentId: string): Promise<{ body: string; assets: string[] }> {
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
      const rev = await get<{ contentRefs: { body: string; assets: string[] } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
      return { body: new TextDecoder().decode(blob.bytes), assets: rev.contentRefs.assets };
    } finally {
      db.close();
    }
  }, documentId);
}

/** Atributos de la (única) imagen del documento con formato guardado. */
async function imageAttrs(page: Page, documentId: string): Promise<Record<string, unknown>> {
  const { body } = await head(page, documentId);
  const find = (node: {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
  }): Record<string, unknown> | undefined =>
    node.type === 'image'
      ? node.attrs
      : (node.content ?? []).map((c) => find(c as typeof node)).find(Boolean);
  return find((JSON.parse(body) as { content: object }).content) ?? {};
}

const saved = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

/** PNG de 200×80: mitad izquierda roja, mitad derecha azul (generado en el navegador). */
async function testPng(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(200, 80);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#d00000';
    context.fillRect(0, 0, 100, 80);
    context.fillStyle = '#0000d0';
    context.fillRect(100, 0, 100, 80);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(bytes);
}

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('documento con formato: cambiar el tamaño, recortar, girar, restablecer y exportar a Word', async ({
  page,
}) => {
  await freshStart(page);
  await newDocument(page, 'Documento con formato');
  const docId = await activeId(page);
  await page
    .getByTestId('doc-image-input')
    .setInputFiles({ name: 'franjas.png', mimeType: 'image/png', buffer: await testPng(page) });
  const frame = page.getByTestId('doc-editor').locator('.doc-image-frame');
  await expect(frame).toHaveClass(/is-ready/);
  await expect
    .poll(() => frame.evaluate((el) => el.getBoundingClientRect().width))
    .toBeCloseTo(200, 0);

  // Seleccionar la imagen muestra su barra; el tirador cambia el ancho conservando la proporción.
  await frame.click();
  await expect(page.getByTestId('image-bar')).toBeVisible();
  const handle = frame.locator('.doc-image-handle--se');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 102, box.y + 40, { steps: 6 });
  await page.mouse.up();
  await saved(page);
  // Unos 100 px más ancha (el arrastre puede perder algún píxel al empezar).
  await expect
    .poll(async () => Number((await imageAttrs(page, docId))['width'] ?? 0))
    .toBeGreaterThan(285);
  const width = Number((await imageAttrs(page, docId))['width']);
  expect(width).toBeLessThan(315);
  const size = await frame.evaluate((el) => el.getBoundingClientRect());
  expect(size.width).toBeCloseTo(width, 0);
  expect(size.height).toBeCloseTo((width * 80) / 200, 0);

  // Recortar la mitad izquierda (la roja) arrastrando el lado derecho del marco.
  await page.getByTestId('image-crop').click();
  const dialog = page.getByTestId('image-crop-dialog');
  await expect(dialog).toBeVisible();
  const right = (await dialog.getByTestId('image-crop-handle-e').boundingBox())!;
  const stage = (await dialog.locator('.image-crop-stage').boundingBox())!;
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width / 2 - stage.width / 2, right.y + right.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await dialog.getByTestId('image-crop-apply').click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
  await expect
    .poll(async () => {
      const crop = (await imageAttrs(page, docId))['crop'] as { width: number } | null;
      return crop ? Math.round(crop.width * 100) : null;
    })
    .toBe(50);

  // Girar a la derecha: el marco pasa a ser más alto que ancho.
  await frame.click();
  await page.getByTestId('image-rotate-right').click();
  await saved(page);
  await expect.poll(async () => (await imageAttrs(page, docId))['rotation']).toBe(90);
  const turned = await frame.evaluate((el) => el.getBoundingClientRect());
  expect(turned.height).toBeGreaterThan(turned.width);
  // El original no cambia: un solo archivo, el mismo.
  expect((await head(page, docId)).assets).toHaveLength(1);

  // Word recibe la imagen ya recortada (100×80) y girada (80×100).
  await page.getByTestId('export-menu').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('doc-export-docx').click();
  const docx = unzipSync(new Uint8Array(await readFile((await (await download).path())!)));
  const media = Object.entries(docx).filter(([name]) => /^word\/media\/.+\.png$/.test(name));
  expect(media).toHaveLength(1);
  expect(pngSize(media[0]![1])).toEqual({ width: 80, height: 100 });

  // Restablecer deja la imagen como era; deshacer lo vuelve a aplicar.
  await frame.click();
  await page.getByTestId('image-reset').click();
  await saved(page);
  await expect
    .poll(async () => {
      const attrs = await imageAttrs(page, docId);
      return [attrs['width'] ?? null, attrs['rotation'] ?? null, attrs['crop'] ?? null];
    })
    .toEqual([null, null, null]);
  await page.keyboard.press('ControlOrMeta+z');
  await saved(page);
  await expect.poll(async () => (await imageAttrs(page, docId))['rotation']).toBe(90);

  // Tras recargar sigue girada.
  await page.reload();
  await expect(frame).toHaveClass(/is-ready/);
  const reloaded = await frame.evaluate((el) => el.getBoundingClientRect());
  expect(reloaded.height).toBeGreaterThan(reloaded.width);
});

test('documento Markdown: girar guarda una copia de la imagen y la cita', async ({ page }) => {
  await freshStart(page);
  await newDocument(page, 'Documento Markdown');
  const docId = await activeId(page);
  await page.keyboard.type('Portada: ');
  await page
    .getByTestId('doc-image-input')
    .setInputFiles({ name: 'franjas.png', mimeType: 'image/png', buffer: await testPng(page) });
  const img = page.getByTestId('doc-editor').locator('img.doc-image');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(200);
  await saved(page);
  await expect.poll(async () => (await head(page, docId)).assets).toHaveLength(1);
  const before = (await head(page, docId)).assets;

  await img.click();
  await expect(page.getByTestId('image-bar')).toBeVisible();
  await expect(page.getByTestId('image-size-50')).toHaveCount(0);
  await page.getByTestId('image-rotate-right').click();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(80);
  await saved(page);
  await expect.poll(async () => (await head(page, docId)).assets[0]).not.toBe(before[0]);
  const after = await head(page, docId);
  expect(after.assets).toHaveLength(1);
  expect(after.body).toContain(`mindnote-asset:${after.assets[0]}`);
});
