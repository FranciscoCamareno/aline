import { expect, test, type Page } from '@playwright/test';

/**
 * Recorridos del núcleo local en Chromium: crear, guardar automáticamente y reabrir.
 * No certifican Safari en iPad, el Apple Pencil ni las metas de rendimiento.
 */
test.use({ locale: 'es-ES' });

interface StoredScene {
  elements: Array<{ type: string; isDeleted?: boolean }>;
}

/** Lee de IndexedDB la cabeza vigente de un documento y su cuerpo. */
async function readHead(page: Page, documentId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = <T>(store: string, key: string) =>
      new Promise<T>((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result as T);
        r.onerror = () => reject(r.error);
      });
    try {
      const doc = await get<{ title: string; headRevisionIds: string[] }>('documents', id);
      const rev = await get<{ contentRefs: { body: string } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
      return {
        title: doc.title,
        heads: doc.headRevisionIds.length,
        body: new TextDecoder().decode(blob.bytes),
      };
    } finally {
      db.close();
    }
  }, documentId);
}

async function sceneElements(page: Page, documentId: string) {
  const { body } = await readHead(page, documentId);
  return (JSON.parse(body) as StoredScene).elements.filter((e) => !e.isDeleted);
}

async function activeDocumentId(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  expect(id).toBeTruthy();
  return id!;
}

/** Dibuja una forma con el atajo de teclado del motor arrastrando sobre el lienzo. */
async function drawShape(page: Page, key: 'r' | 'o', from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  // Enfoca una zona vacía del lienzo (lejos de los controles del motor).
  await page.mouse.click(box.x + 150, box.y + 450);
  await page.keyboard.press(key);
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('mindnote-vault'));
  await page.reload();
});

test('la primera apertura muestra un lienzo vacío sin cuenta ni Drive', async ({ page }) => {
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('library-title-text')).toHaveText('Lienzo sin título');
});

test('un lienzo dibujado se guarda y se conserva al reabrir', async ({ page }) => {
  await expect(page.locator('.excalidraw')).toBeVisible();
  const id = await activeDocumentId(page);

  await drawShape(page, 'r', [550, 250], [700, 350]);
  await expect.poll(() => sceneElements(page, id)).toHaveLength(1);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  expect(await activeDocumentId(page)).toBe(id);

  // Si la escena reabierta no contuviera el rectángulo, el siguiente guardado lo perdería.
  await drawShape(page, 'o', [750, 250], [880, 350]);
  await expect
    .poll(async () => (await sceneElements(page, id)).map((e) => e.type).sort())
    .toEqual(['ellipse', 'rectangle']);
});

test('una nota Markdown se guarda automáticamente y se conserva al reabrir', async ({ page }) => {
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  const id = await activeDocumentId(page);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nTexto con **negrita** y ñandú.');
  await expect(page.getByTestId('note-preview').locator('strong')).toHaveText('negrita');
  await expect.poll(async () => (await readHead(page, id)).body).toContain('ñandú');

  const stored = await readHead(page, id);
  expect(stored.body).toMatch(new RegExp(`^---\\nschema_version: 1\\nid: ${id}\\n`));

  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Texto con **negrita** y ñandú.');
  expect(await activeDocumentId(page)).toBe(id);
});

test('cambiar de documento guarda antes de salir', async ({ page }) => {
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  const id = await activeDocumentId(page);

  await editor.click();
  await page.keyboard.type('cambio rápido');
  // Antes de que venza la espera de 500 ms se abre otro documento.
  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect.poll(async () => (await readHead(page, id)).body).toContain('cambio rápido');

  await page.getByTestId('library-title-text').filter({ hasText: 'Nota sin título' }).click();
  await expect(page.locator('.cm-content')).toContainText('cambio rápido');
});

test('renombrar conserva la identidad y persiste tras recargar', async ({ page }) => {
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  const id = await activeDocumentId(page);

  const item = page.locator(`[data-testid="library-item"][data-document-id="${id}"]`);
  await item.getByTestId('library-title-rename').click();
  await item.getByTestId('library-title-input').fill('Ideas de arquitectura');
  await item.getByTestId('library-title-input').press('Enter');
  await expect(item.getByTestId('library-title-text')).toHaveText('Ideas de arquitectura');
  await expect(page.getByTestId('active-title-text')).toHaveText('Ideas de arquitectura');

  // También se renombra un lienzo desde el título de la cabecera.
  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').fill('Mapa principal');
  await page.getByTestId('active-title-input').press('Enter');
  await expect(page.getByTestId('active-title-text')).toHaveText('Mapa principal');

  await page.reload();
  await expect(item.getByTestId('library-title-text')).toHaveText('Ideas de arquitectura');
  await expect(
    page.getByTestId('library-title-text').filter({ hasText: 'Mapa principal' }),
  ).toHaveCount(1);
  const stored = await readHead(page, id);
  expect(stored.title).toBe('Ideas de arquitectura');
  expect(stored.heads).toBe(1);
  expect(stored.body).toContain('title: "Ideas de arquitectura"');
});
