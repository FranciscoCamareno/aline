import { expect, test, type Page } from '@playwright/test';

/**
 * Estructura de la biblioteca y de la cabecera (DESIGN.md §6): «Nuevo» con desplegable, buscador
 * de títulos, pestañas «Todos» y «Recientes», acciones de fila en «⋯», pie con papelera,
 * preferencias y ayuda, y una cabecera con Historial, Enlaces, Exportar y «⋯».
 */
test.use({ locale: 'es-ES' });

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

test('biblioteca: Nuevo, buscador, pestañas, menú de fila y pie', async ({ page }) => {
  await freshStart(page);
  const library = page.getByRole('navigation', { name: 'Biblioteca' });

  // Un solo botón principal con su desplegable.
  await expect(library.locator('button.primary')).toHaveCount(1);
  await page.getByTestId('new-menu').click();
  const menu = page.getByRole('menu', { name: 'Nuevo' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Lienzo',
    'Nota',
    'Carpeta',
    'Importar archivos…',
    'Importar carpeta…',
  ]);
  await menu.getByRole('menuitem', { name: 'Nota' }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('.cm-content')).toBeVisible();

  // Renombrar desde el menú «⋯» de la fila.
  const note = page.locator('[data-testid="library-item"].active');
  await note.getByTestId('library-actions').click();
  await note.getByTestId('library-title-rename').click();
  await note.getByTestId('library-title-input').fill('Ideas sueltas');
  await note.getByTestId('library-title-input').press('Enter');
  await expect(note.getByTestId('library-title-text')).toHaveText('Ideas sueltas');

  // El buscador filtra por título.
  await page.getByTestId('library-search').fill('ideas');
  await expect(page.getByTestId('library-results').getByTestId('library-item')).toHaveCount(1);
  await page.getByTestId('library-search').fill('');
  await expect(page.getByTestId('library-item')).toHaveCount(2);

  // Pestañas.
  await page.getByRole('tab', { name: 'Recientes' }).click();
  await expect(page.getByRole('tab', { name: 'Recientes' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('recent-item')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Todos' }).click();

  // Pie: papelera con su recuento, preferencias (idioma) y ayuda solo con un lienzo abierto.
  await expect(page.getByTestId('trash-toggle')).toContainText('(0)');
  await expect(page.getByTestId('open-help')).toBeDisabled();
  await page.getByTestId('open-preferences').click();
  await expect(page.getByTestId('preferences').getByLabel('Idioma')).toBeVisible();
  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  await expect(page.getByTestId('open-help')).toBeEnabled();
  await page.getByTestId('open-help').click();
  await expect(page.locator('.excalidraw .HelpDialog')).toBeVisible();
});

test('cabecera: Historial, Enlaces y Exportar a la vista; lo demás en «⋯»', async ({ page }) => {
  await freshStart(page);
  const header = page.locator('header.topbar');
  await expect(page.getByTestId('open-history')).toBeVisible();
  await expect(page.getByTestId('open-details')).toContainText('Enlaces');
  await expect(header.getByRole('combobox')).toHaveCount(0);

  await page.getByTestId('export-menu').click();
  await expect(page.getByRole('menu', { name: 'Exportar' }).getByRole('menuitem')).toHaveText([
    'Imagen, PDF o .excalidraw…',
    'Todas las notas en Markdown (.zip)',
  ]);
  await page.getByTestId('canvas-export').click();
  const exportDialog = page.getByRole('dialog');
  await expect(exportDialog).toBeVisible();
  await exportDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(exportDialog).toBeHidden();

  await page.getByTestId('more-menu').click();
  await expect(page.getByRole('menu', { name: 'Más opciones' }).getByRole('menuitem')).toHaveText([
    /Buscar/,
    'Estado y diagnóstico',
  ]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('more-menu')).toBeFocused();

  // Con la biblioteca plegada, la cabecera ofrece el botón para abrirla.
  await page.getByRole('button', { name: /biblioteca/i }).click();
  await expect(page.getByRole('navigation', { name: 'Biblioteca' })).toBeHidden();
  await page.getByRole('button', { name: /biblioteca/i }).click();
  await expect(page.getByRole('navigation', { name: 'Biblioteca' })).toBeVisible();
});
