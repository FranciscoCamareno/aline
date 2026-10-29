import { expect, test, type Page } from '@playwright/test';

/** Inicio (plan 11): todos los documentos en un solo sitio, al estilo de «Mi unidad». */
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

const item = (page: Page, title: string) =>
  page.getByTestId('home-item').filter({ has: page.getByText(title, { exact: true }) });

test('Inicio: todo junto, buscar, filtrar, mover varios a una carpeta, entrar y abrir', async ({
  page,
}) => {
  await freshStart(page);
  // Una nota con texto, un documento y una carpeta de «Notas»; el lienzo inicial ya existe.
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Primera línea del apunte');
  await saved(page);
  await renameActive(page, 'Apunte');
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-input').fill('Ideas');
  await page.getByTestId('new-folder-input').press('Enter');
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: 'Documento con formato' }).click();
  await expect(page.getByTestId('doc-editor')).toBeFocused();
  await page.keyboard.type('Informe trimestral');
  await saved(page);
  await renameActive(page, 'Informe');

  // Inicio no abre ningún documento: muestra todo, carpetas primero.
  await page.getByTestId('section-home').click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(page.getByTestId('active-title-text')).toHaveCount(0);
  const items = page.getByTestId('home-items').getByTestId('home-item');
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText('Ideas');
  await expect(page.getByTestId('home-recent')).toContainText('Apunte');
  // La miniatura de la nota son sus primeras líneas.
  await expect(item(page, 'Apunte').locator('.home-thumb-text')).toContainText(
    'Primera línea del apunte',
  );

  // Filtro por tipo y búsqueda por título en todo el almacén.
  await page.getByTestId('home-filter-docs').click();
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('Informe');
  await page.getByTestId('home-filter-all').click();
  await page.getByTestId('home-search').fill('apun');
  await expect(items).toHaveCount(1);
  await page.getByTestId('home-search').fill('');

  // Una nota y un documento no se pueden mover juntos (secciones distintas).
  await item(page, 'Apunte').getByTestId('home-select').check();
  await item(page, 'Informe').getByTestId('home-select').check();
  await expect(page.getByTestId('home-bulk')).toContainText('2 seleccionados');
  await expect(page.getByTestId('home-bulk-move')).toBeDisabled();
  await item(page, 'Informe').getByTestId('home-select').uncheck();

  // La nota y el lienzo, juntos a «Ideas».
  await item(page, 'Lienzo sin título').getByTestId('home-select').check();
  await page.getByTestId('home-bulk-move').click();
  await page.getByTestId('home-move-target').selectOption({ label: 'Ideas' });
  await page.getByTestId('home-move-confirm').click();
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId('home-bulk')).toHaveCount(0);

  // Entrar en la carpeta (miga de pan) y volver.
  await item(page, 'Ideas').getByTestId('home-open').click();
  await expect(page.getByTestId('home-crumbs')).toContainText('Ideas');
  await expect(items).toHaveCount(2);
  await page.getByTestId('home-crumbs').getByRole('button', { name: 'Todo' }).click();
  await expect(items).toHaveCount(2);

  // Vista de lista (se recuerda) y abrir: lleva a la sección del documento.
  await page.getByTestId('home-layout-list').click();
  await expect(page.getByTestId('home-items')).toHaveClass(/home-items--list/);
  await item(page, 'Informe').getByTestId('home-title-text').click();
  await expect(page.getByTestId('doc-editor')).toContainText('Informe trimestral');
  await expect(page.getByRole('tab', { name: 'Documentos' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByTestId('section-home').click();
  await expect(page.getByTestId('home-items')).toHaveClass(/home-items--list/);

  // Enviar a la papelera desde Inicio no saca de Inicio.
  await item(page, 'Informe').getByTestId('home-actions').click();
  await page.getByTestId('home-trash').click();
  await expect(item(page, 'Informe')).toHaveCount(0);
  await expect(page.getByTestId('home-view')).toBeVisible();
});
