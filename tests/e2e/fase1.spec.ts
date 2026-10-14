import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Recorridos de la fase 1 en Chromium (cierre de la base). */
test.use({ locale: 'es-ES' });

async function freshVault(page: Page) {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('mindnote-vault'));
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
}

async function activeDocumentId(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  expect(id).toBeTruthy();
  return id!;
}

/** Lee el cuerpo de la cabeza vigente de un documento directamente de IndexedDB. */
async function headBody(page: Page, documentId: string): Promise<{ heads: number; body: string }> {
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
      const doc = await get<{ headRevisionIds: string[] }>('documents', id);
      const rev = await get<{ contentRefs: { body: string } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
      return { heads: doc.headRevisionIds.length, body: new TextDecoder().decode(blob.bytes) };
    } finally {
      db.close();
    }
  }, documentId);
}

test('reabre el último documento abierto, no el último modificado (FP-01)', async ({ page }) => {
  await freshVault(page);
  const canvasId = await activeDocumentId(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  // La nota es la más reciente; se vuelve al lienzo antes de recargar.
  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  expect(await activeDocumentId(page)).toBe(canvasId);
});

test('panel de estado: persistencia, diagnóstico y exportación de emergencia', async ({ page }) => {
  await freshVault(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('texto de emergencia');
  const noteId = await activeDocumentId(page);
  await expect
    .poll(async () => (await headBody(page, noteId)).body)
    .toContain('texto de emergencia');

  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-status').click();
  const panel = page.getByTestId('status-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('storage-persisted')).not.toBeEmpty();
  await expect(panel.getByTestId('diagnostics-list')).toContainText('app-start');

  const downloadPromise = page.waitForEvent('download');
  await panel.getByTestId('emergency-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mindnote-emergencia-.*\.json$/);
  const data = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
    kind: string;
    snapshot: { documents: Array<{ id: string }> };
    blobs: Array<{ base64: string }>;
    missingBlobs: string[];
  };
  expect(data.kind).toBe('mindnote-emergency-export');
  expect(data.snapshot.documents.map((d) => d.id)).toContain(noteId);
  expect(data.missingBlobs).toEqual([]);
  const texts = data.blobs.map((b) => Buffer.from(b.base64, 'base64').toString('utf8'));
  expect(texts.some((t) => t.includes('texto de emergencia'))).toBe(true);

  const diagPromise = page.waitForEvent('download');
  await panel.getByTestId('export-diagnostics').click();
  const diag = JSON.parse(readFileSync((await (await diagPromise).path())!, 'utf8')) as {
    entries: Array<{ code: string; message: string }>;
  };
  expect(diag.entries.some((e) => e.code === 'emergency-export')).toBe(true);
  // El registro no contiene el texto de las notas.
  expect(JSON.stringify(diag)).not.toContain('texto de emergencia');
});

test('almacén inaccesible: aviso sin borrar nada y almacén temporal (FA-01b)', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException('Bloqueado para la prueba', 'InvalidStateError');
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('startup-error')).toBeVisible();
  await page.getByTestId('startup-temporary').click();
  await expect(page.getByTestId('temporary-banner')).toBeVisible();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await page.locator('.cm-content').click();
  await page.keyboard.type('en memoria');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
});

test('una revisión de versión futura se abre en solo lectura y no se sobrescribe', async ({
  page,
}) => {
  await freshVault(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  const noteId = await activeDocumentId(page);
  await page.waitForTimeout(300);

  // Simula una revisión escrita por una versión posterior de la aplicación.
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['documents', 'revisions'], 'readwrite');
    const docReq = tx.objectStore('documents').get(id);
    docReq.onsuccess = () => {
      const headId = (docReq.result as { headRevisionIds: string[] }).headRevisionIds[0]!;
      const revReq = tx.objectStore('revisions').get(headId);
      revReq.onsuccess = () => {
        tx.objectStore('revisions').put({ ...(revReq.result as object), schemaVersion: 2 });
      };
    };
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  }, noteId);

  await page.reload();
  await expect(page.getByTestId('read-only-notice')).toBeVisible();
  const before = await headBody(page, noteId);
  await page.locator('.cm-content').click();
  await page.keyboard.type('no debe guardarse');
  await expect(page.locator('.cm-content')).not.toContainText('no debe guardarse');
  await page.waitForTimeout(800);
  expect(await headBody(page, noteId)).toEqual(before);
});

test('una nota grande se guarda (hash en worker) y se reabre íntegra', async ({ page }) => {
  const workerScripts: string[] = [];
  page.on('worker', (w) => workerScripts.push(w.url()));
  await freshVault(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  const noteId = await activeDocumentId(page);
  const big = 'línea de prueba con acentos áéíóú ñ ✓ '.repeat(1200); // ~48 KB en UTF-8
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(`\n${big}FIN`);
  await expect.poll(async () => (await headBody(page, noteId)).body.endsWith('FIN')).toBe(true);
  // El hash de más de 16 KB se calculó en el worker.
  expect(workerScripts.some((url) => url.includes('hash.worker'))).toBe(true);
  expect(new TextEncoder().encode((await headBody(page, noteId)).body).byteLength).toBeGreaterThan(
    16 * 1024,
  );
  await page.reload();
  // CodeMirror solo pinta la parte visible: se lleva el cursor al final antes de comprobar.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(page.locator('.cm-content')).toContainText('FIN');
  expect((await headBody(page, noteId)).body.endsWith('FIN')).toBe(true);
});
