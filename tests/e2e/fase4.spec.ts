import { expect, test, type Page } from '@playwright/test';
import { clickAndWaitForReload } from './vaultSwitch.ts';

/**
 * Fase 4 sin Drive: carpeta local, sincronización entre dos «dispositivos» y ediciones externas.
 * El selector nativo de carpetas no es automatizable: se sustituye por una carpeta del sistema
 * de archivos privado del navegador (OPFS), que tiene la misma API de File System Access.
 */
test.use({ locale: 'es-ES' });

const FOLDER = 'carpeta-sync';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((name) => {
    (
      window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  }, FOLDER);
});

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async (name) => {
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
    await (
      await navigator.storage.getDirectory()
    )
      .removeEntry(name, { recursive: true })
      .catch(() => undefined);
  }, FOLDER);
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
}

/** Lista una carpeta de OPFS (rutas relativas a la carpeta sincronizada). */
async function listFolder(page: Page, sub: string): Promise<string[]> {
  return page.evaluate(
    async ([name, path]) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name!);
      for (const part of path!.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part);
      const names: string[] = [];
      for await (const key of (dir as unknown as { keys(): AsyncIterable<string> }).keys())
        names.push(key);
      return names.sort();
    },
    [FOLDER, sub],
  );
}

async function activeId(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  expect(id).toBeTruthy();
  return id!;
}

async function newNote(page: Page, text: string): Promise<string> {
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  return activeId(page);
}

async function connectFolder(page: Page) {
  await page.getByTestId('open-profile').click();
  await page.getByTestId('settings-storage').click();
  await page.getByTestId('connect-folder').click();
}

test('conectar una carpeta y sincronizar dos dispositivos a través de ella (RF-36, CA-33)', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'contenido escrito en el equipo A');
  await connectFolder(page);
  await expect(page.getByTestId('storage-phase')).toHaveText('al día');
  expect(await listFolder(page, '')).toEqual(
    expect.arrayContaining([
      'README.md',
      'catalog.json',
      'heads',
      'objects',
      'readable',
      'revisions',
      'vault.json',
    ]),
  );
  expect(await listFolder(page, 'readable')).toContain(noteId);

  // Al recargar se revalida el permiso y se sincroniza sola.
  await page.reload();
  await expect(page.getByTestId('remote-status')).toContainText('Carpeta al día');

  // «Otro equipo»: un almacén distinto de este navegador abre el de la carpeta.
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-status').click();
  await page.getByPlaceholder('Nombre del almacén nuevo').fill('Equipo B');
  await clickAndWaitForReload(page, page.getByRole('button', { name: 'Crear y abrir' }));
  await expect(page.locator('.excalidraw')).toBeVisible();
  await connectFolder(page);
  await expect(page.getByTestId('folder-mismatch')).toBeVisible();
  await clickAndWaitForReload(page, page.getByTestId('open-folder-vault'));
  await expect(page.getByTestId('remote-status')).toContainText('Carpeta al día');
  if (await page.getByTestId('settings-close').isVisible()) {
    await page.getByTestId('settings-close').click();
  }
  const item = page.locator(`[data-testid="library-item"][data-document-id="${noteId}"]`);
  await expect(item).toBeVisible();
  await item.getByTestId('library-title-text').click();
  await expect(page.locator('.cm-content')).toContainText('contenido escrito en el equipo A');
  // Abrir el almacén de la carpeta no añade un lienzo vacío al almacén compartido.
  await expect(page.getByTestId('library-item')).toHaveCount(2);

  // Edita en el «equipo B» y sincroniza.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('editado en el equipo B');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  await page.getByTestId('remote-status').click();
  await page.getByTestId('folder-sync').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('al día');
  await page.getByTestId('settings-close').click();

  // De vuelta en el «equipo A»: al abrir se sincroniza y aparece el cambio.
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-status').click();
  await clickAndWaitForReload(
    page,
    page
      .getByTestId('vault-item')
      .filter({ hasText: 'Mi almacén' })
      .first()
      .getByRole('button', { name: 'Abrir' }),
  );
  await expect(page.getByTestId('remote-status')).toContainText('Carpeta al día');
  if (await page.getByTestId('status-panel').isVisible()) {
    await page.getByTestId('status-panel').getByRole('button', { name: 'Cerrar' }).click();
  }
  await page
    .locator(`[data-testid="library-item"][data-document-id="${noteId}"]`)
    .getByTestId('library-title-text')
    .click();
  await expect(page.locator('.cm-content')).toContainText('editado en el equipo B');
});

test('una edición hecha fuera de la aplicación se importa como versión nueva (§8.3, CA-28)', async ({
  page,
}) => {
  await freshStart(page);
  const noteId = await newNote(page, 'texto original');
  await connectFolder(page);
  await expect(page.getByTestId('storage-phase')).toHaveText('al día');

  // Un editor externo modifica la copia legible de la versión vigente.
  const files = await listFolder(page, `readable/${noteId}`);
  const latest = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
    });
    const doc = await new Promise<{ headRevisionIds: string[] }>((resolve) => {
      const r = db.transaction('documents').objectStore('documents').get(id);
      r.onsuccess = () => resolve(r.result as { headRevisionIds: string[] });
    });
    db.close();
    return doc.headRevisionIds[0]!;
  }, noteId);
  expect(files).toContain(`${latest}.md`);
  await page.evaluate(
    async ([name, docId, rev]) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(name!);
      const dir = await (await root.getDirectoryHandle('readable')).getDirectoryHandle(docId!);
      const handle = await dir.getFileHandle(`${rev}.md`);
      const text = (await (await handle.getFile()).text()).replace(
        'texto original',
        'editado con un editor externo',
      );
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
    },
    [FOLDER, noteId, latest],
  );

  await page.getByTestId('folder-sync').click();
  // Sin cambios pendientes en el editor, la nota abierta se recarga sola con la versión nueva.
  await expect(page.locator('.cm-content')).toContainText('editado con un editor externo');
  await page.getByTestId('settings-close').click();
  await page.getByTestId('open-history').click();
  await expect(page.getByTestId('history-item').first()).toContainText('Cambio externo');
});
