import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

/**
 * Imágenes en los documentos (fase 8.4) y exportar un documento con formato a Word (.docx) y a
 * PDF (impresión del navegador). Ninguna imagen se pide a otro origen.
 */
test.use({ locale: 'es-ES' });

/** PNG de 1×1 píxel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

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

function watchForeignRequests(page: Page): string[] {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== new URL(page.url()).origin) foreign.push(request.url());
  });
  return foreign;
}

const saved = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

/** La imagen se ve: URL local y cargada. */
async function expectShown(page: Page) {
  const img = page.getByTestId('doc-editor').locator('img.doc-image');
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
}

test('documento con formato: insertar una imagen, guardarla y volver a verla', async ({ page }) => {
  await freshStart(page);
  const foreign = watchForeignRequests(page);
  await newDocument(page, 'Documento con formato');
  const docId = await activeId(page);
  await page.keyboard.type('Portada:');
  await page.keyboard.press('Enter');
  await page
    .getByTestId('doc-image-input')
    .setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: PNG });
  await expectShown(page);
  await saved(page);
  await expect.poll(async () => (await head(page, docId)).assets).toHaveLength(1);
  const { body, assets } = await head(page, docId);
  expect(body).toContain(`"src":"mindnote-asset:${assets[0]}"`);

  await page.reload();
  await expectShown(page);

  // Un archivo que no es una imagen admitida no se inserta.
  await page.getByTestId('doc-image-input').setInputFiles({
    name: 'dibujo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.getByTestId('doc-image-error')).toBeVisible();
  await expect(page.getByTestId('doc-editor').locator('img.doc-image')).toHaveCount(1);
  expect(foreign).toEqual([]);
});

test('documento Markdown: la imagen se guarda como archivo y se cita en el Markdown', async ({
  page,
}) => {
  await freshStart(page);
  await newDocument(page, 'Documento Markdown');
  const docId = await activeId(page);
  await page.keyboard.type('Portada: ');
  await page
    .getByTestId('doc-image-input')
    .setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: PNG });
  await expectShown(page);
  await saved(page);
  await expect.poll(async () => (await head(page, docId)).assets).toHaveLength(1);
  const { body, assets } = await head(page, docId);
  expect(body).toContain(`![portada](mindnote-asset:${assets[0]})`);
  await page.reload();
  await expectShown(page);
});

test('exportar un documento con formato a Word y a PDF', async ({ page }) => {
  await freshStart(page);
  await newDocument(page, 'Documento con formato');
  await page.keyboard.type('Informe trimestral');
  await page
    .getByTestId('doc-image-input')
    .setInputFiles({ name: 'grafico.png', mimeType: 'image/png', buffer: PNG });
  await expectShown(page);
  await saved(page);

  // Word: se descarga un .docx (un ZIP) con el texto y la imagen.
  await page.getByTestId('export-menu').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('doc-export-docx').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.docx$/);
  const bytes = await (
    await file.createReadStream()
  )
    .toArray()
    .then((chunks) => Buffer.concat(chunks as Buffer[]));
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.includes(Buffer.from('word/media/'))).toBe(true);

  // PDF: la impresión del navegador con solo la copia del documento.
  await page.evaluate(() => {
    window.print = () => {
      const root = document.querySelector('.print-root');
      (window as unknown as { printed: unknown }).printed = {
        text: root?.textContent ?? '',
        images: root?.querySelectorAll('img').length ?? 0,
        title: document.title,
        printing: document.documentElement.classList.contains('printing-doc'),
      };
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.getByTestId('export-menu').click();
  await page.getByTestId('doc-export-pdf').click();
  const printed = await page.evaluate(() => (window as unknown as { printed: unknown }).printed);
  expect(printed).toMatchObject({
    text: 'Informe trimestral',
    images: 1,
    title: 'Documento sin título',
    printing: true,
  });
  await expect(page.locator('.print-root')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/printing-doc/);
});

async function downloaded(download: Promise<Download>): Promise<{ name: string; bytes: Buffer }> {
  const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

for (const [item, kind] of [
  ['Documento con formato', 'doc'],
  ['Documento Markdown', 'mddoc'],
] as const) {
  test(`${kind}: insertar una tabla, añadir y quitar filas y columnas, y guardarla (plan 9.7)`, async ({
    page,
  }) => {
    await freshStart(page);
    await newDocument(page, item);
    const docId = await activeId(page);
    const table = page.getByTestId('doc-editor').locator('table');
    const tableAction = async (id: string) => {
      await page.getByTestId('doc-table').click();
      await page.getByTestId(`doc-table-${id}`).click();
    };
    await tableAction('insert');
    await expect(table.locator('tr')).toHaveCount(3);
    await expect(table.locator('tr').first().locator('th')).toHaveCount(3);
    // El cursor queda en la primera celda: se escribe y se pasa a la siguiente con Tab.
    await page.keyboard.type('Tarea');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Estado');
    await tableAction('row-after');
    await expect(table.locator('tr')).toHaveCount(4);
    await tableAction('col-after');
    await expect(table.locator('tr').first().locator('th, td')).toHaveCount(4);
    // «Eliminar columna» quita la del cursor: la de «Estado».
    await tableAction('delete-col');
    await expect(table.locator('tr').first().locator('th, td')).toHaveCount(3);
    if (kind === 'mddoc') {
      await page.getByTestId('doc-table').click();
      await expect(page.getByTestId('doc-table-delete-row')).toBeDisabled();
      await expect(page.getByTestId('doc-table-row-before')).toBeDisabled();
      await page.keyboard.press('Escape');
    }
    // Se quita la última fila (en un documento Markdown, la de encabezado no se puede quitar).
    await table.locator('tr').last().locator('td').first().click();
    await tableAction('delete-row');
    await expect(table.locator('tr')).toHaveCount(3);
    await saved(page);
    await expect
      .poll(async () => (await head(page, docId)).body)
      .toMatch(kind === 'doc' ? /"type":"table"/ : /\| Tarea +\| +\| +\|/);

    await tableAction('delete-table');
    await expect(table).toHaveCount(0);
  });
}

test('exportar un documento con formato a Markdown: tabla, imagen en assets/ y lo que se pierde (plan 9.8)', async ({
  page,
}) => {
  await freshStart(page);
  await newDocument(page, 'Documento con formato');
  await page.keyboard.type('Informe');
  await page.getByTestId('doc-underline').click();
  await page.keyboard.type(' sub');
  await page.keyboard.press('Enter');
  await page
    .getByTestId('doc-image-input')
    .setInputFiles({ name: 'grafico.png', mimeType: 'image/png', buffer: PNG });
  await expectShown(page);
  // La imagen recién insertada queda seleccionada: la tabla va después, al final.
  await page.keyboard.press('ControlOrMeta+End');
  await page.getByTestId('doc-table').click();
  await page.getByTestId('doc-table-insert').click();
  await page.keyboard.type('Celda');
  await expect(page.getByTestId('doc-editor').locator('img.doc-image')).toHaveCount(1);
  await saved(page);

  await page.getByTestId('export-menu').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId('doc-export-md').click();
  const zip = await downloaded(pending);
  expect(zip.name).toMatch(/\.zip$/);
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files);
  expect(names).toHaveLength(2);
  const image = names.find((name) => /^assets\/[0-9a-f]{16}\.png$/.test(name));
  expect(image).toBeTruthy();
  const markdown = decode(files[names.find((name) => name.endsWith('.md'))!]);
  expect(markdown).toContain('Informe sub');
  expect(markdown).toContain(`![grafico](${image})`);
  expect(markdown).toMatch(/\| Celda \|/);
  await expect(page.getByTestId('doc-markdown-losses')).toContainText('subrayado');
});

test('la exportación Markdown por carpetas lleva también los documentos (plan 9.9)', async ({
  page,
}) => {
  await freshStart(page);
  await newDocument(page, 'Documento con formato');
  await page.keyboard.type('Texto con formato');
  await saved(page);
  await newDocument(page, 'Documento Markdown');
  await page.keyboard.type('Texto en Markdown');
  await saved(page);

  await page.getByTestId('export-menu').click();
  const zip = page.waitForEvent('download');
  await page.getByTestId('export-markdown').click();
  const files = unzipSync(new Uint8Array((await downloaded(zip)).bytes));
  const docs = Object.keys(files).filter((name) => name.startsWith('Documentos/'));
  expect(docs).toHaveLength(2);
  const texts = docs.map((name) => decode(files[name]));
  expect(texts.some((t) => t.includes('Texto con formato'))).toBe(true);
  expect(texts.some((t) => t.includes('Texto en Markdown'))).toBe(true);
});
