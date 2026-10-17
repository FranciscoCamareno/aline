import { expect, test, type Page } from '@playwright/test';

/**
 * Fuentes adicionales (fase 8.2): las del catálogo están en el selector de fuentes del lienzo
 * (gracias al parche del motor) y en la barra de los documentos con formato, se sirven desde el
 * propio origen y solo se descargan al usarse. Si una actualización del motor rompe el parche,
 * la prueba del lienzo falla.
 */
test.use({ locale: 'es-ES' });

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
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

/** Cuerpo de la cabeza vigente, leído de IndexedDB. */
async function headBody(page: Page, documentId: string): Promise<string> {
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
      const rev = await get<{ contentRefs: { body: string } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
      return new TextDecoder().decode(blob.bytes);
    } finally {
      db.close();
    }
  }, documentId);
}

/** Peticiones a otros orígenes (no debe haber ninguna: privacidad, diseño §13). */
function watchForeignRequests(page: Page): string[] {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== new URL(page.url()).origin) foreign.push(request.url());
  });
  return foreign;
}

test('lienzo: una fuente del catálogo está en el selector del motor y se guarda en la escena', async ({
  page,
}) => {
  await freshStart(page);
  const foreign = watchForeignRequests(page);
  const canvasId = await activeId(page);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.mouse.dblclick(box.x + 400, box.y + 260);
  await page.keyboard.type('Hola fuentes');
  await page.keyboard.press('Escape');

  // El selector de fuentes del motor, con su búsqueda rápida, incluye las del catálogo.
  const fontRequest = page.waitForRequest((r) => r.url().includes('/fonts-extra/inter/'));
  await page.getByTestId('font-family-show-fonts').click();
  await page.keyboard.type('Inter');
  await page.getByRole('button', { name: 'Inter', exact: true }).click();
  await fontRequest;

  await expect
    .poll(async () => {
      const scene = JSON.parse(await headBody(page, canvasId)) as {
        elements: Array<{ type: string; fontFamily?: number; text?: string }>;
      };
      return scene.elements.find((e) => e.type === 'text')?.fontFamily;
    })
    .toBe(2001);
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('20px Inter', 'Hola')), {
      timeout: 15_000,
    })
    .toBe(true);

  // Tras recargar sigue con su fuente.
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('20px Inter', 'Hola')), {
      timeout: 15_000,
    })
    .toBe(true);
  expect(foreign).toEqual([]);
});

test('documento con formato: fuente con búsqueda y A+/A− sobre la selección, y que se guarde', async ({
  page,
}) => {
  await freshStart(page);
  const foreign = watchForeignRequests(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: 'Documento con formato' }).click();
  const editor = page.getByTestId('doc-editor');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Capítulo uno');
  await page.keyboard.press('ControlOrMeta+a');

  // Abrir la lista ya descarga Lora (cada opción se muestra con su fuente), nada antes.
  const loraRequest = page.waitForRequest((r) => r.url().includes('/fonts-extra/lora/'));
  await page.getByTestId('doc-font').click();
  // La lista cabe en la ventana y se desplaza dentro del panel (no se sale de él).
  const fit = await page.getByTestId('doc-font-panel').evaluate((panel) => {
    const list = panel.querySelector('ul')!;
    const box = panel.getBoundingClientRect();
    const inner = list.getBoundingClientRect();
    return {
      inside: box.bottom <= window.innerHeight && inner.bottom <= box.bottom + 1,
      scrolls: list.scrollHeight > list.clientHeight,
    };
  });
  expect(fit).toEqual({ inside: true, scrolls: true });
  await page.getByTestId('doc-font-search').fill('lora');
  await loraRequest;
  await expect(page.getByTestId('doc-font-option')).toHaveText(['Lora']);
  await page.getByTestId('doc-font-option').click();
  await expect(page.getByTestId('doc-font')).toContainText('Lora');

  await expect(page.getByTestId('doc-font-size')).toHaveText('16');
  await page.getByTestId('doc-font-larger').click();
  await page.getByTestId('doc-font-larger').click();
  await expect(page.getByTestId('doc-font-size')).toHaveText('20');
  await page.getByTestId('doc-font-smaller').click();
  await expect(page.getByTestId('doc-font-size')).toHaveText('18');

  const span = editor.locator('span[style*="font-family"]');
  await expect(span).toHaveText('Capítulo uno');
  await expect(span).toHaveCSS('font-size', '18px');
  await expect(span).toHaveCSS('font-family', /Lora/);
  // La cara regular de Lora quedó cargada (el motor añade su propia copia sin cargar, así que
  // document.fonts.check no sirve aquí).
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          [...document.fonts].some(
            (f) =>
              f.family === 'Lora' &&
              f.weight === '400' &&
              f.style === 'normal' &&
              f.status === 'loaded',
          ),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  const docId = await activeId(page);
  const body = await headBody(page, docId);
  expect(body).toContain('"type":"textStyle"');
  expect(body).toContain('"fontSize":"18px"');
  expect(body).toContain('Lora');

  // «Predeterminada» quita la fuente.
  await page.getByTestId('doc-font').click();
  await page.getByTestId('doc-font-default').click();
  await expect(editor.locator('span[style*="font-family"]')).toHaveCount(0);
  expect(foreign).toEqual([]);
});
