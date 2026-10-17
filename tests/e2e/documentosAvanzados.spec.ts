import { expect, test, type Page } from '@playwright/test';

/**
 * Documentos con formato (fase 8.3): zoom de la hoja, panel de capítulos, paginación de la
 * vista «Hoja» y comentarios con respuestas, resolver y eliminar.
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

async function newRichDoc(page: Page) {
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: 'Documento con formato' }).click();
  await expect(page.getByTestId('doc-editor')).toBeFocused();
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

const saved = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

test('zoom de la hoja: acercar, alejar, volver al 100 % y recordarlo', async ({ page }) => {
  await freshStart(page);
  await newRichDoc(page);
  const sheet = page.locator('.doc-sheet');
  await page.getByTestId('doc-zoom-in').click();
  await page.getByTestId('doc-zoom-in').click();
  await expect(page.getByTestId('doc-zoom-value')).toHaveText('125%');
  await expect(sheet).toHaveCSS('zoom', '1.25');
  await page.reload();
  await expect(page.getByTestId('doc-zoom-value')).toHaveText('125%');
  await page.getByTestId('doc-zoom-out').click();
  await expect(page.getByTestId('doc-zoom-value')).toHaveText('110%');
  await page.getByTestId('doc-zoom-value').click();
  await expect(page.getByTestId('doc-zoom-value')).toHaveText('100%');
  await expect(sheet).toHaveCSS('zoom', '1');
});

test('capítulos: los títulos en un panel lateral que lleva a cada uno', async ({ page }) => {
  await freshStart(page);
  await newRichDoc(page);
  const write = async (style: 'h1' | 'h2' | 'paragraph', text: string) => {
    await page.getByTestId('doc-block-style').selectOption(style);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  await write('h1', 'Primer acto');
  await write('paragraph', 'Texto del primer acto.');
  await write('h2', 'Escena de lluvia');
  await write('paragraph', 'Llueve.');
  await write('h1', 'Segundo acto');

  await page.getByTestId('doc-outline-toggle').click();
  const items = page.getByTestId('doc-outline-item');
  await expect(items).toHaveText(['Primer acto', 'Escena de lluvia', 'Segundo acto']);
  await items.filter({ hasText: 'Escena de lluvia' }).click();
  await expect(items.filter({ hasText: 'Escena de lluvia' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  // Es solo presentación: abrirlo no crea revisiones ni cambia el documento.
  await saved(page);
  await page.reload();
  await expect(page.getByTestId('doc-outline')).toBeVisible();
});

test('paginación: la vista «Hoja» se parte en páginas A4 y «Continuo» no', async ({ page }) => {
  await freshStart(page);
  await newRichDoc(page);
  const docId = await activeId(page);
  for (let i = 1; i <= 45; i++) {
    await page.keyboard.type(`Párrafo ${i} con algo de texto para ocupar una línea.`);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('doc-page-count')).toHaveText('2 páginas');
  const pageBreak = page.locator('.doc-page-break');
  await expect(pageBreak).toHaveCount(1);
  // La página 2 empieza en su margen superior: 297 mm + separación + 25 mm desde arriba.
  const gap = await page.evaluate(() => {
    const sheet = document.querySelector('.doc-sheet')!.getBoundingClientRect();
    const next = document.querySelector('.doc-page-break')!.nextElementSibling!;
    return next.getBoundingClientRect().top - sheet.top;
  });
  const mm = 96 / 25.4;
  expect(Math.abs(gap - (297 * mm + 24 + 25 * mm))).toBeLessThan(4);
  // El salto es una decoración: no está en el documento guardado.
  await saved(page);
  expect(await headBody(page, docId)).not.toContain('page');

  await page.getByTestId('doc-layout-continuous').click();
  await expect(pageBreak).toHaveCount(0);
  await expect(page.getByTestId('doc-page-count')).toHaveCount(0);
});

test('comentarios: comentar una frase, responder, resolver, reabrir y eliminar', async ({
  page,
}) => {
  await freshStart(page);
  await newRichDoc(page);
  const docId = await activeId(page);
  await page.keyboard.type('El guion necesita una escena de lluvia.');
  for (let i = 0; i < ' de lluvia.'.length; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 'una escena'.length; i++) await page.keyboard.press('Shift+ArrowLeft');

  await page.getByTestId('doc-comment').click();
  await page.getByTestId('doc-comment-input').fill('¿De día o de noche?');
  await page.getByTestId('doc-comment-save').click();
  const thread = page.getByTestId('doc-comment-thread');
  await expect(thread).toHaveCount(1);
  await expect(thread).toContainText('«una escena»');
  await expect(thread.getByTestId('doc-comment-text')).toHaveText('¿De día o de noche?');
  const highlight = page.getByTestId('doc-editor').locator('.doc-comment');
  await expect(highlight).toHaveText('una escena');

  await thread.getByTestId('doc-comment-reply-input').fill('De noche.');
  await thread.getByTestId('doc-comment-reply-input').press('Enter');
  await expect(thread.getByTestId('doc-comment-reply')).toContainText('De noche.');

  await saved(page);
  await expect.poll(() => headBody(page, docId)).toContain('"type":"comment"');
  const body = JSON.parse(await headBody(page, docId)) as {
    comments: Array<{ text: string; replies: Array<{ text: string }> }>;
  };
  expect(body.comments).toHaveLength(1);
  expect(body.comments[0]).toMatchObject({
    text: '¿De día o de noche?',
    replies: [{ text: 'De noche.' }],
  });

  // Tras recargar, el panel se abre solo porque hay comentarios.
  await page.reload();
  await expect(thread).toContainText('De noche.');
  await expect(highlight).toHaveText('una escena');

  // Resolver: sin resaltado y en «resueltos»; reabrir lo devuelve.
  await thread.getByTestId('doc-comment-resolve').click();
  await expect(highlight).toHaveCount(0);
  await expect(page.locator('.doc-comments-resolved summary')).toHaveText('1 resuelto');
  await page.locator('.doc-comments-resolved summary').click();
  await thread.getByTestId('doc-comment-resolve').click();
  await expect(highlight).toHaveText('una escena');

  // Eliminar quita el hilo y la marca del texto.
  page.once('dialog', (dialog) => void dialog.accept());
  await thread.getByTestId('doc-comment-delete').click();
  await expect(thread).toHaveCount(0);
  await expect(highlight).toHaveCount(0);
  await saved(page);
  await expect.poll(() => headBody(page, docId)).not.toContain('"comment"');
});
