import { expect, test, type Page } from '@playwright/test';

/**
 * Fase 7.B: enlazar una selección de texto desde notas, documentos con formato y documentos
 * Markdown hacia cualquier documento o evento del calendario, y seguir el enlace.
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

async function saved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
}

async function newNote(page: Page, text: string): Promise<string> {
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await saved(page);
  return activeId(page);
}

async function newDocument(page: Page, item: string, text: string): Promise<string> {
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: item }).click();
  await expect(page.getByTestId('doc-editor')).toBeFocused();
  await page.keyboard.type(text);
  await saved(page);
  return activeId(page);
}

async function renameActive(page: Page, title: string) {
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').fill(title);
  await page.getByTestId('active-title-input').press('Enter');
  await expect(page.getByTestId('active-title-text')).toHaveText(title);
}

/** Selecciona las últimas `count` letras antes del cursor. */
async function selectBack(page: Page, count: number) {
  for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowLeft');
}

async function pick(page: Page, query: string, title: string) {
  await expect(page.getByTestId('link-picker')).toBeVisible();
  await page.getByTestId('link-search').fill(query);
  await page.getByTestId('link-candidate').filter({ hasText: title }).click();
  await expect(page.getByTestId('link-picker')).toBeHidden();
}

test('nota: Ctrl+K enlaza la selección con un documento con formato y el enlace lo abre', async ({
  page,
}) => {
  await freshStart(page);
  const docId = await newDocument(page, 'Documento con formato', 'Escena uno');
  await renameActive(page, 'Guion');

  await page.getByRole('tab', { name: 'Notas' }).click();
  const noteId = await newNote(page, 'Revisar el guion mañana');
  await page.keyboard.press('End');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');
  await selectBack(page, 5);
  await page.keyboard.press('ControlOrMeta+k');
  await pick(page, 'Gui', 'Guion');
  const link = `[guion](aline://document/${docId})`;
  await expect(page.locator('.cm-content')).toContainText(link);
  await saved(page);
  expect(await headBody(page, noteId)).toContain(`Revisar el ${link} mañana`);

  await page.getByTestId('note-preview').getByRole('link', { name: 'guion' }).click();
  await expect(page.getByTestId('doc-view')).toBeVisible();
  await expect(page.getByTestId('active-title-text')).toHaveText('Guion');
});

test('documento con formato: el botón enlaza la selección con una nota y el enlace la abre', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'contenido');
  await renameActive(page, 'Destino');

  const docId = await newDocument(page, 'Documento con formato', 'Ver el destino');
  await selectBack(page, 7);
  await page.getByTestId('doc-link').click();
  await pick(page, 'Dest', 'Destino');
  const anchor = page.getByTestId('doc-editor').locator('a');
  await expect(anchor).toHaveText('destino');
  await expect(anchor).toHaveAttribute('href', `aline://document/${noteId}`);
  await saved(page);
  expect(await headBody(page, docId)).toContain(`aline://document/${noteId}`);

  await anchor.click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByTestId('active-title-text')).toHaveText('Destino');
});

test('documento Markdown: Ctrl+K enlaza la selección y se guarda como enlace Markdown', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'contenido');
  await renameActive(page, 'Destino');

  const docId = await newDocument(page, 'Documento Markdown', 'Ver el destino');
  await selectBack(page, 7);
  await page.keyboard.press('ControlOrMeta+k');
  await pick(page, 'Dest', 'Destino');
  await expect(page.getByTestId('doc-editor').locator('a')).toHaveText('destino');
  await saved(page);
  await expect
    .poll(() => headBody(page, docId))
    .toContain(`Ver el [destino](aline://document/${noteId})`);
  // Milkdown conserva el destino interno en el DOM (su saneado lo vaciaba).
  await expect(page.getByTestId('doc-editor').locator('a')).toHaveAttribute(
    'href',
    `aline://document/${noteId}`,
  );

  // Selección con el ratón (doble clic en una palabra) y el botón de la barra.
  await page
    .getByTestId('doc-editor')
    .getByText('Ver', { exact: false })
    .dblclick({
      position: { x: 4, y: 6 },
    });
  await page.getByTestId('doc-link').click();
  await pick(page, 'Dest', 'Destino');
  await expect(page.getByTestId('doc-editor').locator('a')).toHaveText(['Ver', 'destino']);
  await expect
    .poll(() => headBody(page, docId))
    .toContain(`[Ver](aline://document/${noteId}) el [destino]`);

  await page.getByTestId('doc-editor').locator('a').last().click();
  await expect(page.getByTestId('active-title-text')).toHaveText('Destino');
});

test('enlazar con un evento del calendario y abrirlo desde la nota', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await expect(page.getByTestId('calendar-item')).toHaveText(['Personal']);
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-title').fill('Entrega portada');
  await page.getByTestId('event-all-day').check();
  await page.getByTestId('event-save').click();
  await saved(page);

  await page.getByRole('tab', { name: 'Notas' }).click();
  await newNote(page, 'Preparar la entrega');
  await selectBack(page, 7);
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('link-search').fill('Pers');
  await page.getByTestId('link-candidate').filter({ hasText: 'Personal' }).click();
  await page.getByTestId('link-event').filter({ hasText: 'Entrega portada' }).click();
  await expect(page.locator('.cm-content')).toContainText('[entrega](aline://document/');
  await expect(page.locator('.cm-content')).toContainText('#ev=');
  await saved(page);

  await page.getByTestId('note-preview').getByRole('link', { name: 'entrega' }).click();
  await expect(page.getByTestId('calendar-view')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Editar evento' })).toBeVisible();
  await expect(page.getByTestId('event-title')).toHaveValue('Entrega portada');
});

/** Texto seleccionado ahora mismo en la página (el editor activo lo refleja en el DOM). */
async function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

test('anclas: copiar el enlace a una frase de un documento con formato, enlazarla y llegar a ella', async ({
  page,
}) => {
  await freshStart(page);
  const docId = await newDocument(page, 'Documento con formato', 'Contexto');
  await renameActive(page, 'Decisiones');
  await page.getByTestId('doc-editor').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('La decisión clave es usar IndexedDB.');
  await page.keyboard.press('ArrowLeft');
  await selectBack(page, 'usar IndexedDB'.length);
  await page.getByTestId('doc-copy-link').click();
  await expect(page.getByTestId('link-copied-notice').first()).toContainText('usar IndexedDB');
  // El bloque recibe su ancla al copiar el enlace (y solo entonces).
  await saved(page);
  await expect.poll(() => headBody(page, docId)).toMatch(/"anchor":"[A-Za-z0-9_-]+"/);
  expect((await headBody(page, docId)).match(/"anchor"/g)).toHaveLength(1);

  await page.getByRole('tab', { name: 'Notas' }).click();
  const noteId = await newNote(page, 'Ver ');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('link-copied').click();
  await expect(page.locator('.cm-content')).toContainText(
    `[usar IndexedDB](aline://document/${docId}#b=`,
  );
  await saved(page);
  expect(await headBody(page, noteId)).toMatch(/#b=[A-Za-z0-9_-]+&t=/);

  // Seguir el enlace abre el documento con la frase seleccionada.
  await page.getByTestId('note-preview').getByRole('link', { name: 'usar IndexedDB' }).click();
  await expect(page.getByTestId('active-title-text')).toHaveText('Decisiones');
  await expect.poll(() => selectedText(page)).toBe('usar IndexedDB');
  await expect(page.getByTestId('anchor-notice')).toHaveCount(0);
  // El fragmento enlazado se resalta en el destino, con quién lo enlaza (fase 7.F).
  const mark = page.getByTestId('doc-editor').locator('.backlink-mark');
  await expect(mark).toHaveText('usar IndexedDB');
  await expect(mark).toHaveAttribute('title', /^Enlazado desde: /);

  // Si la frase cambia pero el párrafo sigue, se muestra el párrafo con un aviso.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type('La decisión cambió.');
  await saved(page);
  await page.getByRole('tab', { name: 'Notas' }).click();
  await page
    .locator(`[data-testid="library-item"][data-document-id="${noteId}"]`)
    .getByTestId('library-title-text')
    .click();
  await page.getByTestId('note-preview').getByRole('link', { name: 'usar IndexedDB' }).click();
  await expect(page.getByTestId('anchor-notice')).toContainText('cambió');
  await expect.poll(() => selectedText(page)).toBe('La decisión cambió.');
  // Un ancla aproximada ya no se resalta.
  await expect(page.getByTestId('doc-editor').locator('.backlink-mark')).toHaveCount(0);
});

test('anclas: Ctrl+Mayús+K en una nota y el enlace desde un documento Markdown la selecciona', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'Ideas sueltas.\n\nEl **plan B** sale el lunes.');
  await renameActive(page, 'Plan');
  // Seleccionar «plan B» (las marcas de negrita no forman parte de la cita).
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < ' sale el lunes.'.length + 2; i++) await page.keyboard.press('ArrowLeft');
  await selectBack(page, 'plan B'.length);
  await page.keyboard.press('ControlOrMeta+Shift+k');
  await expect(page.getByTestId('link-copied-notice')).toContainText('plan B');

  const docId = await newDocument(page, 'Documento Markdown', 'Revisar ');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('link-copied').click();
  await expect(page.getByTestId('doc-editor').locator('a')).toHaveText('plan B');
  await expect
    .poll(() => headBody(page, docId))
    .toContain(`[plan B](aline://document/${noteId}#t=`);

  await page.getByTestId('doc-editor').locator('a').click();
  await expect(page.getByTestId('active-title-text')).toHaveText('Plan');
  await expect.poll(() => selectedText(page)).toBe('plan B');
  const marks = page.locator('.cm-content .backlink-mark');
  await expect(marks.first()).toHaveAttribute('title', 'Enlazado desde: Documento sin título');
  await expect.poll(async () => (await marks.allTextContents()).join('')).toBe('plan B');
});

test('anclas: copiar el enlace a un evento desde su diálogo', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-title').fill('Rodaje');
  await page.getByTestId('event-all-day').check();
  await page.getByTestId('event-save').click();
  await saved(page);
  await page.getByTestId('event-chip').filter({ hasText: 'Rodaje' }).click();
  await page.getByTestId('event-copy-link').click();
  await expect(page.getByTestId('link-copied-notice')).toContainText('Rodaje');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('tab', { name: 'Notas' }).click();
  await newNote(page, 'Preparar ');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('link-copied').click();
  await expect(page.locator('.cm-content')).toContainText('[Rodaje](aline://document/');
  await expect(page.locator('.cm-content')).toContainText('#ev=');
});

test('eventos con enlaces: añadir, guardar, quitar y seguir uno (guarda antes lo cambiado)', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'contenido');
  await renameActive(page, 'Guion final');

  await page.getByRole('tab', { name: 'Calendario' }).click();
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-title').fill('Rodaje');
  await page.getByTestId('event-all-day').check();
  await page.getByTestId('event-add-link').click();
  await pick(page, 'Guion', 'Guion final');
  await page.getByTestId('event-add-link').click();
  await page.getByLabel('Dirección web').fill('https://example.com/plan');
  await page.getByRole('button', { name: 'Enlazar web' }).click();
  await expect(page.getByTestId('event-link')).toHaveText([
    'Guion final',
    'https://example.com/plan',
  ]);
  // El selector se cierra sin cerrar el diálogo del evento.
  await expect(page.getByTestId('event-dialog')).toBeVisible();
  await page.getByTestId('event-save').click();
  await saved(page);
  const chip = page.getByTestId('event-chip').filter({ hasText: 'Rodaje' });
  await expect(chip.getByTestId('event-link-mark')).toContainText('2 enlaces');

  // Tras recargar siguen ahí; se quita el de la web.
  await page.reload();
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await page.getByTestId('event-chip').filter({ hasText: 'Rodaje' }).click();
  await expect(page.getByTestId('event-link')).toHaveCount(2);
  await page.getByTestId('event-link-remove').nth(1).click();
  await page.getByTestId('event-save').click();
  await saved(page);
  await expect(chip.getByTestId('event-link-mark')).toContainText('1 enlace');

  // Seguir el enlace con un cambio sin guardar: se guarda y se abre la nota.
  await chip.click();
  await page.getByTestId('event-title').fill('Rodaje nocturno');
  await page.getByTestId('event-link').filter({ hasText: 'Guion final' }).click();
  await expect(page.getByTestId('active-title-text')).toHaveText('Guion final');
  expect(await activeId(page)).toBe(noteId);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await expect(page.getByTestId('event-chip').filter({ hasText: 'Rodaje nocturno' })).toBeVisible();
  await expect(page.getByTestId('event-dialog')).toHaveCount(0);
});

test('índice: backlinks desde un documento con formato y un evento, con su contexto, y búsqueda de eventos', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'contenido');
  await renameActive(page, 'Destino');

  await newDocument(page, 'Documento con formato', 'Revisar el destino hoy');
  for (let i = 0; i < ' hoy'.length; i++) await page.keyboard.press('ArrowLeft');
  await selectBack(page, 'destino'.length);
  await page.getByTestId('doc-link').click();
  await pick(page, 'Dest', 'Destino');
  await saved(page);

  await page.getByRole('tab', { name: 'Calendario' }).click();
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-title').fill('Rodaje en el puerto');
  await page.getByTestId('event-all-day').check();
  await page.getByTestId('event-add-link').click();
  await pick(page, 'Dest', 'Destino');
  await page.getByTestId('event-save').click();
  await saved(page);

  // Los backlinks de la nota incluyen el documento (con la frase) y el calendario.
  await page.getByRole('tab', { name: 'Notas' }).click();
  await page
    .locator(`[data-testid="library-item"][data-document-id="${noteId}"]`)
    .getByTestId('library-title-text')
    .click();
  await page.getByTestId('open-details').click();
  const backlinks = page.getByTestId('backlinks');
  await expect(backlinks).toContainText('Documento sin título');
  await expect(backlinks).toContainText('Personal');
  await expect(backlinks.getByTestId('backlink-context')).toContainText([
    'Revisar el destino hoy',
    'Rodaje en el puerto',
  ]);

  // El backlink del calendario abre el evento.
  await backlinks.getByRole('button').filter({ hasText: 'Personal' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar evento' })).toBeVisible();
  await expect(page.getByTestId('event-title')).toHaveValue('Rodaje en el puerto');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // La búsqueda encuentra el evento y lo abre.
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-search').click();
  await page.getByTestId('search-input').fill('puerto');
  await page.getByTestId('search-hit').filter({ hasText: 'Personal' }).click();
  await expect(page.getByTestId('event-title')).toHaveValue('Rodaje en el puerto');
});

test('resaltado: un documento Markdown marca la frase que otra nota enlaza', async ({ page }) => {
  await freshStart(page);
  await newDocument(page, 'Documento Markdown', 'Hablamos del presupuesto anual hoy.');
  for (let i = 0; i < ' hoy.'.length; i++) await page.keyboard.press('ArrowLeft');
  await selectBack(page, 'presupuesto anual'.length);
  await page.keyboard.press('ControlOrMeta+Shift+k');
  await expect(page.getByTestId('link-copied-notice')).toContainText('presupuesto anual');
  // Sin anclas de bloque en Markdown: copiar no cambia el documento.
  await expect(page.getByTestId('doc-editor').locator('.backlink-mark')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Notas' }).click();
  await newNote(page, 'Ver ');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('link-copied').click();
  await saved(page);
  await page.getByTestId('note-preview').getByRole('link', { name: 'presupuesto anual' }).click();
  const mark = page.getByTestId('doc-editor').locator('.backlink-mark');
  await expect(mark).toHaveText('presupuesto anual');
  await expect(mark).toHaveAttribute('data-backlinks', '1');
});
