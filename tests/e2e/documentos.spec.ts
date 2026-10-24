import { expect, test, type Page } from '@playwright/test';

/**
 * Sección «Documentos»: documentos con formato (kind `doc`, Tiptap) y Markdown (kind `mddoc`,
 * Milkdown), con sus propias carpetas (`docfolder`). Cambios de arquitectura del 15 y el
 * 16/10/2026. Cada cambio es una revisión y sobrevive a recargar.
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
  await expect(page.getByTestId('tool-tray')).toBeVisible();
}

async function newFromMenu(page: Page, item: string) {
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('la biblioteca se llama «Notas» y no muestra los documentos', async ({ page }) => {
  await freshStart(page);
  await expect(page.getByRole('tab', { name: 'Notas' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await expect(page.getByTestId('docs-empty-state')).toBeVisible();
  // El lienzo inicial es de «Notas»: aquí no aparece.
  await expect(page.getByTestId('library-item')).toHaveCount(0);
  await page.getByTestId('new-menu').click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Documento con formato',
    'Documento Markdown',
    'Carpeta',
  ]);
});

test('documento con formato: crear, dar formato, cambiar la vista y que se guarde', async ({
  page,
}) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await newFromMenu(page, 'Documento con formato');
  const editor = page.getByTestId('doc-view').getByTestId('doc-editor');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Guion');
  await page.getByTestId('doc-block-style').selectOption('h1');
  // La alineación es un desplegable de la barra, como en Google Docs.
  await page.getByTestId('doc-align').click();
  await page.getByTestId('doc-align-center').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Escena ');
  await page.getByTestId('doc-bold').click();
  await page.keyboard.type('uno');
  await expect(editor.locator('h1')).toHaveText('Guion');
  await expect(editor.locator('h1')).toHaveCSS('text-align', 'center');
  await expect(editor.locator('strong')).toHaveText('uno');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

  // La vista «Hoja» o «Continuo» es solo presentación; con formato, en hoja por defecto.
  await expect(page.getByTestId('doc-view')).toHaveClass(/layout-page/);
  // La presentación se elige solo en Configuración (plan 10.3): el documento no la ofrece.
  await expect(page.getByTestId('doc-layout')).toHaveCount(0);
  await page.getByTestId('open-profile').click();
  await page.getByTestId('settings-preferences').click();
  await expect(page.getByTestId('doc-layout-doc')).toHaveValue('page');
  await expect(page.getByTestId('doc-layout-mddoc')).toHaveValue('continuous');
  await page.getByTestId('doc-layout-doc').selectOption('continuous');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('doc-view')).toHaveClass(/layout-continuous/);

  // «Notas» no lo muestra; al volver a «Documentos» se abre el más reciente.
  await page.getByRole('tab', { name: 'Notas' }).click();
  await expect(page.getByTestId('doc-view')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await expect(editor.locator('strong')).toHaveText('uno');

  // Tras recargar sigue ahí, con su formato y la última vista elegida.
  await page.reload();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('doc-view')).toHaveClass(/layout-continuous/);
  await expect(editor.locator('h1')).toHaveText('Guion');
  await expect(editor.locator('strong')).toHaveText('uno');
});

test('documento Markdown en una carpeta de «Documentos»: se guarda como Markdown', async ({
  page,
}) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await newFromMenu(page, 'Carpeta');
  await page.getByTestId('new-folder-input').fill('Guiones');
  await page.getByTestId('new-folder-input').press('Enter');
  await page.getByRole('button', { name: 'Guiones', exact: true }).click();
  await newFromMenu(page, 'Documento Markdown');

  const editor = page.getByTestId('md-doc-view').getByTestId('doc-editor');
  await expect(editor).toBeFocused();
  // Los documentos Markdown salen en continuo y sin selector de vista (plan 10.3).
  await expect(page.getByTestId('md-doc-view')).toHaveClass(/layout-continuous/);
  await expect(page.getByTestId('doc-layout')).toHaveCount(0);
  await page.keyboard.type('Escena uno');
  await page.getByTestId('doc-block-style').selectOption('h2');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.getByTestId('doc-bold').click();
  await page.keyboard.type('importante');
  await expect(editor.locator('h2')).toHaveText('Escena uno');
  await expect(editor.locator('strong')).toHaveText('importante');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

  // Dentro de la carpeta «Guiones»; la carpeta no existe en «Notas».
  const folder = page.getByTestId('folder-item').filter({ hasText: 'Guiones' });
  await expect(folder.getByTestId('library-item')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Notas' }).click();
  await expect(page.getByTestId('folder-item')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Documentos' }).click();

  // Lo guardado es Markdown con frontmatter, como una nota. (El estado ya decía «Guardado» al
  // crear el documento: se espera al contenido, no al estado.)
  const savedMarkdown = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('mindnote-vault');
        req.onsuccess = () => resolve(req.result);
      });
      const tx = db.transaction(['revisions', 'blobs'], 'readonly');
      const all = <T>(req: IDBRequest<T>) =>
        new Promise<T>((resolve) => (req.onsuccess = () => resolve(req.result)));
      const revisions = (await all(tx.objectStore('revisions').getAll())) as Array<{
        createdAt: string;
        metadata: { kind: string };
        contentRefs: { body: string };
      }>;
      const head = revisions
        .filter((r) => r.metadata.kind === 'mddoc')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1)!;
      const blob = (await all(tx.objectStore('blobs').get(head.contentRefs.body))) as {
        bytes: Uint8Array;
      };
      db.close();
      return new TextDecoder().decode(blob.bytes);
    });
  await expect.poll(savedMarkdown).toContain('## Escena uno\n\n**importante**');
  expect(await savedMarkdown()).toMatch(/^---\nschema_version: 1\n/);

  await page.reload();
  await expect(editor.locator('h2')).toHaveText('Escena uno');
});

test('documento Markdown: una imagen pegada no se descarga (diseño §13)', async ({ page }) => {
  const external: string[] = [];
  await page.route('https://audit.invalid/**', (route) => {
    external.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await freshStart(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await newFromMenu(page, 'Documento Markdown');
  const editor = page.getByTestId('md-doc-view').getByTestId('doc-editor');
  await expect(editor).toBeFocused();

  // Pegar Markdown y HTML con imágenes remotas, cada uno en su línea.
  const paste = (type: string, value: string) =>
    editor.evaluate(
      (el, [kind, text]) => {
        const data = new DataTransfer();
        data.setData(kind!, text!);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
      },
      [type, value],
    );
  await paste('text/plain', '![pixel](https://audit.invalid/md.png)');
  await expect(editor.locator('.md-image')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await paste('text/html', '<p>web <img src="https://audit.invalid/html.png" alt="foto"></p>');
  await expect(editor.locator('.md-image')).toHaveCount(2);
  // Sin <img src>: el único <img> es el separador interno de ProseMirror, sin dirección.
  await expect(editor.locator('img[src]')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  expect(external).toEqual([]);
});
