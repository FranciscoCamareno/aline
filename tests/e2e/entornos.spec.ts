import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

/**
 * Entornos de trabajo (plan 12): agrupar documentos en Inicio, compartirlos como paquete `.aline`
 * (con o sin contraseña) o como archivos legibles, e importarlos en otro aline.
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

const saved = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

async function renameActive(page: Page, title: string) {
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').fill(title);
  await page.getByTestId('active-title-input').press('Enter');
  await expect(page.getByTestId('active-title-text')).toHaveText(title);
}

async function newNote(page: Page, title: string, text: string) {
  await page.getByRole('tab', { name: 'Notas' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await saved(page);
  await renameActive(page, title);
}

const item = (page: Page, title: string) =>
  page.getByTestId('home-item').filter({ has: page.getByText(title, { exact: true }) });

async function downloaded(download: Promise<Download>): Promise<string> {
  return (await (await download).path())!;
}

/** Otro aline: un contexto de navegador nuevo (su propio IndexedDB). */
async function otherAline(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: 'es-ES', baseURL: 'http://localhost:4173' });
  const page = await context.newPage();
  await freshStart(page);
  return page;
}

async function importPackage(page: Page, path: string, password?: string) {
  await page.getByTestId('section-home').click();
  await page.getByTestId('home-import-workspace').click();
  await page.getByTestId('import-workspace-file').setInputFiles(path);
  if (password) {
    await page.getByTestId('import-workspace-password').fill('equivocada');
    await page.getByTestId('import-workspace-password').press('Enter');
    await expect(page.getByTestId('import-workspace-problem')).toContainText('no es correcta');
    await page.getByTestId('import-workspace-password').fill(password);
    await page.getByTestId('import-workspace-password').press('Enter');
  }
  await expect(page.getByTestId('import-workspace-preview')).toContainText('Proyecto');
}

test('entornos: crear, añadir, avisar de enlaces que salen, compartir e importar en otro aline', async ({
  page,
  browser,
}) => {
  await freshStart(page);
  await newNote(page, 'Privada', 'Esto no se comparte');
  await newNote(page, 'Apunte', 'borrador');
  // El enlace de «Apunte» apunta a «Privada» (fuera del entorno).
  const privadaId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
    });
    const all = await new Promise<Array<{ id: string; title: string }>>((resolve) => {
      const r = db.transaction('documents').objectStore('documents').getAll();
      r.onsuccess = () => resolve(r.result as Array<{ id: string; title: string }>);
    });
    db.close();
    return all.find((d) => d.title === 'Privada')!.id;
  });
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(`Ver [la privada](aline://document/${privadaId})`);
  await saved(page);

  // Inicio: entorno nuevo y vacío.
  await page.getByTestId('section-home').click();
  await page.getByTestId('home-new-workspace').click();
  await page.getByTestId('home-new-workspace-input').fill('Proyecto');
  await page.getByTestId('home-new-workspace-input').press('Enter');
  await expect(page.getByTestId('home-workspace-head')).toContainText('Proyecto');
  await expect(page.getByTestId('home-empty')).toContainText('vacío');

  // Desde la raíz: el lienzo y «Apunte», juntos al entorno.
  await page.getByTestId('home-crumbs').getByRole('button', { name: 'Todo' }).click();
  await item(page, 'Apunte').getByTestId('home-select').check();
  await item(page, 'Lienzo sin título').getByTestId('home-select').check();
  await page.getByTestId('home-bulk-add-workspace').click();
  await page.getByTestId('add-workspace-dialog').getByLabel('Proyecto').check();
  await page.getByTestId('add-workspace-confirm').click();
  await page.getByTestId('home-workspace').filter({ hasText: 'Proyecto' }).click();
  const items = page.getByTestId('home-items').getByTestId('home-item');
  await expect(items).toHaveCount(2);

  // Compartir: el enlace a «Privada» sale del entorno; el paquete, sin contraseña.
  await page.getByTestId('workspace-share').click();
  const dialog = page.getByTestId('share-workspace-dialog');
  await expect(dialog.getByTestId('share-outside')).toContainText('Privada');
  const plain = page.waitForEvent('download');
  await dialog.getByTestId('share-package').click();
  const plainPath = await downloaded(plain);
  // Con contraseña.
  await dialog.getByTestId('share-encrypt').check();
  await dialog.getByTestId('share-password').fill('contraseña-larga');
  await dialog.getByTestId('share-password-confirm').fill('contraseña-larga');
  const sealed = page.waitForEvent('download');
  await dialog.getByTestId('share-package').click();
  const sealedPath = await downloaded(sealed);
  expect((await readFile(sealedPath)).subarray(0, 4).toString()).toBe('ALP1');
  // Para quien no usa aline: un ZIP con la nota en Markdown y el lienzo.
  const readable = page.waitForEvent('download');
  await dialog.getByTestId('share-readable').click();
  const files = Object.keys(unzipSync(new Uint8Array(await readFile(await downloaded(readable)))));
  expect(files).toContain('Apunte.md');
  expect(files).toContain('Lienzo sin título.excalidraw');
  expect(files.some((f) => f.includes('Privada'))).toBe(false);
  await dialog.getByRole('button', { name: 'Cerrar' }).click();

  // Otro aline importa el paquete: el entorno y sus dos documentos, sin «Privada».
  const other = await otherAline(browser);
  await importPackage(other, plainPath);
  await expect(other.getByTestId('import-workspace-preview')).toContainText('Nuevos: 3');
  await other.getByTestId('import-workspace-confirm').click();
  await expect(other.getByTestId('import-workspace-summary')).toContainText('3 nuevos');
  await other.getByTestId('import-workspace-open').click();
  const theirItems = other.getByTestId('home-items').getByTestId('home-item');
  await expect(theirItems).toHaveCount(2);
  await expect(other.getByTestId('home-item').filter({ hasText: 'Privada' })).toHaveCount(0);
  await theirItems.filter({ hasText: 'Apunte' }).getByTestId('home-title-text').click();
  await expect(other.locator('.cm-content')).toContainText('Ver [la privada]');

  // El cifrado: con otra contraseña no abre; con la buena, ya está todo («Ya están»).
  await importPackage(other, sealedPath, 'contraseña-larga');
  await expect(other.getByTestId('import-workspace-preview')).toContainText('Ya están: 3');
  await other.context().close();
});
