import { expect, test, type Page } from '@playwright/test';

/** Recorridos de la fase 2 en Chromium: papelera, historial, conflictos, copias y robustez. */
test.use({ locale: 'es-ES' });

/** Borra todos los almacenes y el registro para empezar de cero. */
async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
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

async function newNote(page: Page, text: string): Promise<string> {
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  return activeId(page);
}

async function replaceNoteText(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
}

test('papelera: enviar, restaurar y eliminar definitivamente (RN-03, CA-15)', async ({ page }) => {
  await freshStart(page);
  const id = await newNote(page, 'para la papelera');
  const item = page.locator(`[data-testid="library-item"][data-document-id="${id}"]`);
  await item.getByTestId('library-trash').click();
  await expect(item).toHaveCount(0);

  await page.getByTestId('trash-toggle').click();
  const trashed = page.locator(`[data-testid="trash-item"][data-document-id="${id}"]`);
  await expect(trashed).toBeVisible();
  await trashed.getByTestId('trash-restore').click();
  await expect(item).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('para la papelera');

  await item.getByTestId('library-trash').click();
  page.once('dialog', (d) => void d.accept());
  await trashed.getByTestId('trash-purge').click();
  await expect(trashed).toHaveCount(0);
  await page.reload();
  await expect(page.locator(`[data-document-id="${id}"]`)).toHaveCount(0);
});

test('historial: ver una versión anterior y restaurarla (RF-31, CA-23)', async ({ page }) => {
  await freshStart(page);
  await newNote(page, 'versión uno');
  await replaceNoteText(page, 'versión dos');
  await replaceNoteText(page, 'versión tres');

  await page.getByTestId('open-history').click();
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(4); // creación + tres guardados
  await items.nth(2).click();
  await expect(page.getByTestId('revision-preview')).toContainText('versión uno');
  await page.getByTestId('history-restore').click();
  await expect(page.locator('.cm-content')).toContainText('versión uno');
  await expect(items).toHaveCount(5);
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('versión uno');
});

test('conflicto entre dos pestañas: se conservan ambas y se resuelve (RF-37, CA-14)', async ({
  page,
  context,
}) => {
  await freshStart(page);
  const id = await newNote(page, 'base común');

  const other = await context.newPage();
  await other.goto('/');
  await expect(other.locator('.cm-content')).toContainText('base común');

  await replaceNoteText(page, 'cambio desde la pestaña A');
  // La pestaña B recibe el aviso, pero edita sin recargar: su cambio queda como otra rama.
  await expect(other.getByTestId('changed-elsewhere')).toBeVisible();
  await other.locator('.cm-content').click();
  await other.keyboard.press('ControlOrMeta+a');
  await other.keyboard.type('cambio desde la pestaña B');
  await expect(other.getByTestId('save-status')).toHaveText('Conflicto');
  await expect(other.getByTestId('conflict-banner')).toBeVisible();

  await other.getByTestId('open-conflict').click();
  const panel = other.getByTestId('conflict-panel');
  await expect(panel.getByTestId('revision-preview')).toHaveCount(2);
  await expect(panel.getByTestId('conflict-diff')).toContainText('cambio desde la pestaña A');
  await panel.getByTestId('conflict-merge-text').fill('A y B combinadas');
  await panel.getByTestId('conflict-merge').click();
  await expect(other.getByTestId('conflict-banner')).toHaveCount(0);
  await expect(other.locator('.cm-content')).toContainText('A y B combinadas');

  await page.reload();
  await expect(
    page.locator(`[data-testid="library-item"][data-document-id="${id}"] .badge`),
  ).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('A y B combinadas');
  // Las dos ramas siguen en el historial.
  await page.getByTestId('open-history').click();
  await expect(
    page.getByTestId('history-item').filter({ hasText: 'Conflicto resuelto' }),
  ).toHaveCount(1);
  await other.close();
});

test('copia ZIP y restauración en un almacén nuevo (RF-32, CA-16)', async ({ page }) => {
  await freshStart(page);
  await newNote(page, 'contenido para la copia ✓');

  await page.getByTestId('open-status').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('backup-zip').click();
  const zip = await download;
  expect(zip.suggestedFilename()).toMatch(/^mindnote-copia-.*\.zip$/);

  await page.getByTestId('restore-file').setInputFiles((await zip.path())!);
  const report = page.getByTestId('restore-report');
  await expect(report).toContainText('coincide byte a byte');
  await expect(page.getByTestId('vault-item')).toHaveCount(2);

  await page.getByTestId('open-restored').click();
  await expect(page.locator('.excalidraw, .cm-content').first()).toBeVisible();
  await page.getByTestId('library-title-text').filter({ hasText: 'Nota sin título' }).click();
  await expect(page.locator('.cm-content')).toContainText('contenido para la copia ✓');
  await page.getByTestId('open-status').click();
  await expect(page.getByTestId('vault-item').filter({ hasText: '(abierto)' })).toContainText(
    'restaurado',
  );
});

test('un trazo a medias se recupera tras cerrar la pestaña antes de levantar el puntero', async ({
  page,
  context,
}) => {
  await freshStart(page);
  const canvasId = await activeId(page);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.mouse.click(box.x + 150, box.y + 450);
  await page.keyboard.press('p'); // dibujo libre
  await page.mouse.move(box.x + 550, box.y + 250);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(box.x + 550 + i * 8, box.y + 250 + Math.sin(i / 3) * 40);
    await page.waitForTimeout(60);
  }
  // Sin levantar el puntero: se cierra la pestaña de golpe.
  await page.close({ runBeforeUnload: false });

  const again = await context.newPage();
  await again.goto('/');
  await expect(again.getByTestId('draft-recovered')).toBeVisible();
  await expect
    .poll(() =>
      again.evaluate(async (id) => {
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
        const doc = await get<{ headRevisionIds: string[] }>('documents', id);
        const rev = await get<{ contentRefs: { body: string } }>(
          'revisions',
          doc.headRevisionIds[0]!,
        );
        const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
        db.close();
        const scene = JSON.parse(new TextDecoder().decode(blob.bytes)) as {
          elements: Array<{ type: string }>;
        };
        return scene.elements.filter((e) => e.type === 'freedraw').length;
      }, canvasId),
    )
    .toBe(1);
});

test('cierre abrupto: se conserva lo escrito más de 5 s antes (CA-10, RNF-04)', async ({
  page,
  context,
}) => {
  await freshStart(page);
  await newNote(page, 'antes del cierre');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' + línea escrita 5 s antes');
  await page.waitForTimeout(5000);
  // Cierre sin oportunidad de guardar: se bloquean pagehide y visibilitychange, de modo que
  // solo cuenta el guardado periódico (no se depende de eventos de salida, diseño §7.1).
  await page.evaluate(() => {
    const block = (e: Event) => e.stopImmediatePropagation();
    window.addEventListener('pagehide', block, true);
    window.addEventListener('visibilitychange', block, true);
    document.addEventListener('visibilitychange', block, true);
  });
  await page.close({ runBeforeUnload: false });

  const again = await context.newPage();
  await again.goto('/');
  await expect(again.locator('.cm-content')).toContainText('línea escrita 5 s antes');
});
