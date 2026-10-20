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

  // Pie: solo Perfil, con su menú (almacenamiento, temas, idioma, archivo y papelera con su
  // recuento). Cada opción abre Configuración en su sección; «Estado y diagnóstico» está en «⋯».
  // La ayuda ya no está aquí.
  await expect(page.getByTestId('open-help')).toHaveCount(0);
  await expect(library.getByTestId('trash-toggle')).toHaveCount(0);
  await expect(page.getByTestId('open-profile')).toContainText('Perfil');
  await page.getByTestId('open-profile').click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Almacenamiento',
    'Temas',
    /^Idioma/,
    /^Archivo\s*0$/,
    /^Papelera\s*0$/,
  ]);
  await page.getByTestId('settings-language').click();
  await expect(page.getByTestId('settings-section-language').getByLabel('Idioma')).toBeVisible();
  // La navegación lateral cambia de sección sin cerrar el modal.
  await page.getByTestId('settings-tab-trash').click();
  await expect(page.getByTestId('trash-list')).toContainText('La papelera está vacía');
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
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
    'Notas y documentos en Markdown (.zip)',
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

test('el menú «⋯» de una carpeta y de lo que contiene cabe en la ventana', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-input').fill('Proyectos');
  await page.getByTestId('new-folder-input').press('Enter');
  const folder = page.getByTestId('folder-item').filter({ hasText: 'Proyectos' });
  // Un documento dentro de la carpeta: con la carpeta seleccionada, lo nuevo se crea dentro.
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(folder.getByTestId('library-item')).toHaveCount(1);

  const viewport = page.viewportSize()!;
  const fitsInWindow = async () => {
    const box = (await page.getByRole('menu').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    // Cada opción se ve entera (el texto largo salta de línea en vez de cortarse).
    for (const item of await page.getByRole('menuitem').all()) {
      const label = item.locator('.menu-label');
      expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
  };
  await folder.getByTestId('folder-actions').first().click();
  await expect(
    page.getByRole('menuitem', { name: /Enviar la carpeta a la papelera/ }),
  ).toBeVisible();
  await fitsInWindow();
  await page.keyboard.press('Escape');
  await folder.getByTestId('library-item').getByTestId('library-actions').click();
  await expect(page.getByRole('menuitem', { name: 'Enviar a la papelera' })).toBeVisible();
  await fitsInWindow();
});

/** Luminancia relativa de un color `rgb()` computado (WCAG). */
const luminance = (rgb: string) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((c) => {
    const v = Number(c) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

for (const scheme of ['light', 'dark'] as const) {
  test(`carpeta marcada (${scheme}): sin texto añadido, borde visible y hover distinguible`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await freshStart(page);
    await page.getByTestId('new-menu').click();
    await page.getByTestId('new-folder').click();
    await page.getByTestId('new-folder-input').fill('Proyectos');
    await page.getByTestId('new-folder-input').press('Enter');
    const row = page
      .getByTestId('folder-item')
      .filter({ hasText: 'Proyectos' })
      .locator('.folder-row');
    await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
    await expect(row).toHaveClass(/selected/);

    // Ya no se añade un texto de ayuda que empuje la lista y tape el borde.
    await expect(page.getByTestId('selected-folder')).toHaveCount(0);
    const scroll = (await page.locator('.library-scroll').boundingBox())!;
    const box = (await row.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(scroll.y);
    expect(await row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');

    // Hover sobre cada parte de la fila marcada: el fondo cambia y se distingue de la fila.
    // Fuera de la fila (tras el clic el ratón sigue encima): su fondo en reposo.
    await page.mouse.move(700, 400);
    const rowBackground = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const part of [
      row.getByRole('button', { name: /Expandir|Contraer/ }),
      row.getByRole('button', { name: 'Proyectos', exact: true }),
      row.getByTestId('folder-actions'),
    ]) {
      await part.hover();
      const hovered = await part.evaluate((el) => {
        // El fondo visible: el del botón superpuesto al de la fila.
        const own = getComputedStyle(el).backgroundColor;
        return own;
      });
      expect(hovered).not.toBe('rgba(0, 0, 0, 0)');
      expect(hovered).not.toBe(rowBackground);
    }
    // Y la fila misma, con el ratón sobre ella, también cambia de fondo.
    await row.hover({ position: { x: 4, y: 4 } });
    const hoveredRow = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(hoveredRow).not.toBe(rowBackground);
    expect(ratio(hoveredRow, rowBackground)).toBeGreaterThan(1);
  });
}

test('el estado de guardado va junto al icono de Historial', async ({ page }) => {
  await freshStart(page);
  const status = (await page.getByTestId('save-status').boundingBox())!;
  const history = (await page.getByTestId('open-history').boundingBox())!;
  // A su izquierda, en la misma línea y pegado (nada entre medias).
  expect(status.x + status.width).toBeLessThanOrEqual(history.x);
  expect(history.x - (status.x + status.width)).toBeLessThan(16);
  expect(Math.abs(status.y + status.height / 2 - (history.y + history.height / 2))).toBeLessThan(8);
});

test('barra lateral en «solo iconos»: se elige en Apariencia y deja una columna útil (plan 9.19)', async ({
  page,
}) => {
  await freshStart(page);
  const library = page.getByRole('navigation', { name: 'Biblioteca' });

  // Por defecto, plegar la oculta del todo.
  await page.getByTestId('open-profile').click();
  await page.getByTestId('settings-appearance').click();
  await expect(page.getByTestId('sidebar-collapse-hide')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('sidebar-collapse-rail').click();
  await expect(page.getByTestId('sidebar-collapse-rail')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  // Plegar deja la columna de iconos (y la cabecera no repite su botón).
  await library.getByRole('button', { name: /biblioteca/i }).click();
  const rail = page.getByTestId('library-rail');
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())!.width).toBeLessThanOrEqual(60);
  await expect(page.locator('.topbar-library-toggle')).toBeHidden();

  // Secciones, Nuevo y Buscar desde la columna.
  await page.getByTestId('rail-section-documents').click();
  await expect(page.getByTestId('rail-section-documents')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('rail-new').click();
  await page.getByTestId('rail-new-doc-markdown').click();
  await expect(page.getByTestId('doc-editor')).toBeVisible();
  await page.getByTestId('rail-section-library').click();
  await page.getByTestId('rail-search').click();
  await expect(page.getByTestId('library-search')).toBeFocused();
  await expect(rail).toHaveCount(0);

  // Se recuerda: tras recargar y plegar, sigue la columna; Perfil también está en ella.
  await page.reload();
  await expect(library).toBeVisible();
  await library.getByRole('button', { name: /biblioteca/i }).click();
  await expect(page.getByTestId('library-rail')).toBeVisible();
  await page.getByTestId('open-profile').click();
  await expect(page.getByTestId('settings-trash')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('rail-expand').click();
  await expect(library).toBeVisible();
});

test('punteros de aline en la interfaz y en el lienzo, o los del sistema (plan 9.16–9.18)', async ({
  page,
}) => {
  await freshStart(page);
  const cursorOf = (testId: string) =>
    page.getByTestId(testId).evaluate((el) => getComputedStyle(el).cursor);
  const canvasCursor = () =>
    page.locator('.excalidraw canvas.interactive').evaluate((el) => getComputedStyle(el).cursor);

  // Por defecto, los de aline: un SVG con su punta y el del sistema detrás.
  expect(await cursorOf('new-menu')).toMatch(/^url\(.+\) \d+ \d+, pointer$/);
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).cursor)).toMatch(
    /^url\(.+\) \d+ \d+, default$/,
  );
  // En el lienzo: la mano abierta con la herramienta Mano; la cruz de las formas, la del motor.
  await page.getByTestId('tool-hand').click();
  await expect.poll(canvasCursor).toMatch(/^url\(.+\) \d+ \d+, grab$/);
  await page.getByTestId('tool-shape').click();
  await expect.poll(canvasCursor).toBe('crosshair');

  // «Del sistema» en Apariencia: vuelven los punteros del sistema, también en el lienzo.
  await page.getByTestId('open-profile').click();
  await page.getByTestId('settings-appearance').click();
  await page.getByTestId('cursor-preference').selectOption('system');
  await page.keyboard.press('Escape');
  expect(await cursorOf('new-menu')).toBe('pointer');
  await page.getByTestId('tool-hand').click();
  await expect.poll(canvasCursor).toBe('grab');
  // Se recuerda al recargar.
  await page.reload();
  await expect(page.getByTestId('new-menu')).toBeVisible();
  expect(await cursorOf('new-menu')).toBe('pointer');
});
