import { expect, test, type Page } from '@playwright/test';

/**
 * Organizar la barra lateral (17/10/2026): orden de las secciones, arrastrar carpetas dentro y
 * fuera de otras, orden manual (arrastrando o con «Subir»/«Bajar») y archivar.
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

async function newFolder(page: Page, title: string) {
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-input').fill(title);
  await page.getByTestId('new-folder-input').press('Enter');
  await expect(page.getByTestId('folder-title-text').filter({ hasText: title })).toBeVisible();
}

async function newNote(page: Page, title: string) {
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').fill(title);
  await page.getByTestId('active-title-input').press('Enter');
  await expect(page.getByTestId('active-title-text')).toHaveText(title);
}

/** Títulos de las carpetas de la raíz, en el orden en que se ven. */
const rootFolders = (page: Page) =>
  page
    .getByTestId('library-list')
    .locator(
      ':scope > [data-testid="folder-item"] > .folder-row [data-testid="folder-title-text"]',
    );

/** Títulos de los documentos de la raíz, en el orden en que se ven. */
const rootDocs = (page: Page) =>
  page
    .getByTestId('library-list')
    .locator(':scope > [data-testid="library-item"] [data-testid="library-title-text"]');

const folderRow = (page: Page, title: string) =>
  page.locator('.folder-row').filter({
    has: page.getByTestId('folder-title-text').filter({ hasText: new RegExp(`^${title}$`) }),
  });

test('las secciones van en el orden Notas, Documentos, Calendario', async ({ page }) => {
  await freshStart(page);
  await expect(page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab')).toHaveText([
    'Notas',
    'Documentos',
    'Calendario',
  ]);
});

test('carpetas: subir y bajar, arrastrar dentro y fuera de otra, y que se guarde', async ({
  page,
}) => {
  await freshStart(page);
  await newFolder(page, 'Alfa');
  await newFolder(page, 'Beta');
  await expect(rootFolders(page)).toHaveText(['Alfa', 'Beta']);

  // «Subir» desde el menú «⋯» (la alternativa táctil al arrastre).
  await folderRow(page, 'Beta').getByTestId('folder-actions').click();
  await page.getByTestId('folder-move-up').click();
  await expect(rootFolders(page)).toHaveText(['Beta', 'Alfa']);
  await page.reload();
  await expect(rootFolders(page)).toHaveText(['Beta', 'Alfa']);

  // Arrastrar una carpeta sobre el centro de otra la mete dentro.
  await folderRow(page, 'Alfa').dragTo(folderRow(page, 'Beta'));
  await expect(rootFolders(page)).toHaveText(['Beta']);
  const beta = page
    .getByTestId('folder-item')
    .filter({ has: folderRow(page, 'Beta') })
    .first();
  await expect(beta.locator('.nested [data-testid="folder-title-text"]')).toHaveText(['Alfa']);

  // Y soltarla en el espacio libre la devuelve a la raíz.
  const root = page.getByTestId('library-drop-root');
  const box = (await root.boundingBox())!;
  await folderRow(page, 'Alfa').dragTo(root, { targetPosition: { x: 60, y: box.height - 16 } });
  await expect(rootFolders(page)).toHaveText(['Beta', 'Alfa']);
  await page.reload();
  await expect(rootFolders(page)).toHaveText(['Beta', 'Alfa']);
});

test('documentos: soltar sobre la mitad de arriba de otra fila la coloca antes', async ({
  page,
}) => {
  await freshStart(page);
  await newNote(page, 'Uno');
  await newNote(page, 'Dos');
  // Por defecto, lo más reciente primero.
  await expect(rootDocs(page)).toHaveText(['Dos', 'Uno', 'Lienzo sin título']);

  const row = (title: string) =>
    page.getByTestId('library-item').filter({
      has: page.getByTestId('library-title-text').filter({ hasText: new RegExp(`^${title}$`) }),
    });
  await row('Lienzo sin título').dragTo(row('Dos'), { targetPosition: { x: 40, y: 3 } });
  await expect(rootDocs(page)).toHaveText(['Lienzo sin título', 'Dos', 'Uno']);
  await page.reload();
  await expect(rootDocs(page)).toHaveText(['Lienzo sin título', 'Dos', 'Uno']);
});

test('archivar: sale de la barra, está en Configuración y en la búsqueda, y vuelve', async ({
  page,
}) => {
  await freshStart(page);
  await newNote(page, 'Ideas viejas');
  const row = page.getByTestId('library-item').filter({ hasText: 'Ideas viejas' });
  await row.getByTestId('library-actions').click();
  await page.getByTestId('library-archive').click();
  await expect(row).toHaveCount(0);

  // Perfil → Archivo, con su recuento.
  await page.getByTestId('open-profile').click();
  await expect(page.getByTestId('settings-archive')).toContainText('1');
  await page.getByTestId('settings-archive').click();
  await expect(page.getByTestId('archive-item')).toHaveText(['Ideas viejas']);
  await page.getByTestId('settings-close').click();

  // La búsqueda lo encuentra, marcado como archivado.
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-search').click();
  await page.getByTestId('search-input').fill('ideas viejas');
  const hit = page.getByTestId('search-hit').filter({ hasText: 'Ideas viejas' });
  await expect(hit.getByTestId('search-archived')).toHaveText('Archivado');
  await page.keyboard.press('Escape');

  // Desarchivar lo devuelve a la barra.
  await page.getByTestId('open-profile').click();
  await page.getByTestId('settings-archive').click();
  await page.getByTestId('archive-restore').click();
  await expect(page.getByTestId('archive-item')).toHaveCount(0);
  await page.getByTestId('settings-close').click();
  await expect(row).toBeVisible();
});
