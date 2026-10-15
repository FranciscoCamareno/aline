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

  // Pie: papelera con su recuento, preferencias (idioma) y perfil. La ayuda ya no está aquí.
  await expect(page.getByTestId('trash-toggle')).toContainText('(0)');
  await expect(page.getByTestId('open-help')).toHaveCount(0);
  await expect(page.getByTestId('open-profile')).toContainText('Perfil');
  await page.getByTestId('open-preferences').click();
  await expect(page.getByTestId('preferences').getByLabel('Idioma')).toBeVisible();
  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  // La ayuda es el botón «?» del lienzo, abajo a la derecha, y solo existe con un lienzo abierto.
  await page.locator('.excalidraw .help-icon').click();
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

test('ayuda: botón «?» del lienzo, sin textos del motor y con el estilo de la aplicación', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await freshStart(page);

  // El botón «?» está abajo a la derecha del lienzo; los textos de ayuda del motor, ocultos.
  const help = page.locator('.excalidraw .help-icon');
  await expect(help).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await help.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(viewport.width - 80);
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 80);
  await expect(page.locator('.excalidraw .HintViewer')).toBeHidden();
  // En la biblioteca no hay botón de ayuda y en una nota tampoco existe el del lienzo.
  await expect(page.getByTestId('open-help')).toHaveCount(0);

  // El menú del lienzo ya no repite «Ayuda».
  await page.locator('.excalidraw .main-menu-trigger').click();
  const canvasMenu = page.locator('.excalidraw .dropdown-menu');
  await expect(canvasMenu).toBeVisible();
  await expect(
    canvasMenu.locator('.dropdown-menu-item').filter({ hasText: 'Exportar' }),
  ).toHaveCount(1);
  await expect(canvasMenu.locator('.dropdown-menu-item').filter({ hasText: 'Ayuda' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');

  // El botón «?» del lienzo abre el diálogo, con los colores de la aplicación y sin enlaces
  // externos (documentación, blog, GitHub, YouTube).
  await page.locator('.excalidraw .help-icon').click();
  const dialog = page.locator('.excalidraw .HelpDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.HelpDialog__header')).toHaveCount(0);
  // El foco entra en el diálogo (no se queda en la biblioteca) y se queda dentro con Tab.
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  const colors = await page.evaluate(() => {
    const color = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      content: color('.excalidraw .Modal__content'),
      key: color('.excalidraw .HelpDialog__key'),
    };
  });
  expect(colors.content).toBe('rgb(255, 253, 244)'); // --bg-popover (papel)
  expect(colors.key).toBe('rgb(255, 246, 204)'); // --selection-soft (crema limón)
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('arrastrar un documento dentro y fuera de una carpeta, y que se guarde', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-input').fill('Proyectos');
  await page.getByTestId('new-folder-input').press('Enter');
  const folder = page.getByTestId('folder-item').filter({ hasText: 'Proyectos' });
  await expect(folder).toBeVisible();

  // El lienzo inicial está en la raíz.
  const rootList = page.getByTestId('library-list');
  const id = await rootList
    .locator(':scope > [data-testid="library-item"]')
    .first()
    .getAttribute('data-document-id');
  const item = page.locator(`[data-testid="library-item"][data-document-id="${id}"]`);
  const inFolder = folder.locator(`[data-testid="library-item"][data-document-id="${id}"]`);
  const inRoot = rootList.locator(
    `:scope > [data-testid="library-item"][data-document-id="${id}"]`,
  );

  // Dentro: soltar sobre la fila de la carpeta (que se despliega para mostrarlo).
  await item.dragTo(folder.locator('.folder-row'));
  await expect(inFolder).toBeVisible();
  await expect(inRoot).toHaveCount(0);
  await page.reload();
  await folder.getByRole('button', { name: /Expandir: Proyectos/ }).click();
  await expect(inFolder).toBeVisible();

  // Fuera: soltar en el espacio libre de «Todos».
  // Cerca del borde inferior del área de «Todos», lejos de la carpeta.
  const root = page.getByTestId('library-drop-root');
  const rootBox = (await root.boundingBox())!;
  await item.dragTo(root, { targetPosition: { x: 60, y: rootBox.height - 16 } });
  await expect(inRoot).toBeVisible();
  await expect(inFolder).toHaveCount(0);
  await page.reload();
  await expect(inRoot).toBeVisible();
});
