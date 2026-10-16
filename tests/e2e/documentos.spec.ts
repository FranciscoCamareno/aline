import { expect, test, type Page } from '@playwright/test';

/**
 * Documentos de texto enriquecido (kind `doc`, Tiptap): sección propia en la barra lateral
 * (cambio de arquitectura del 15/10/2026). Cada cambio es una revisión y sobrevive a recargar.
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
  await expect(page.getByTestId('tool-tray')).toBeVisible();
}

test('documentos: crear, dar formato, cambiar la vista y que se guarde', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await expect(page.getByTestId('docs-empty-state')).toBeVisible();
  // Los lienzos y notas no aparecen en esta sección.
  await expect(page.getByTestId('doc-item')).toHaveCount(0);

  await page.getByTestId('new-doc').click();
  const editor = page.getByTestId('doc-editor');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Guion');
  await page.getByTestId('doc-block-style').selectOption('h1');
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

  // La vista «Hoja» o «Continuo» es solo presentación.
  await page.getByTestId('doc-layout-continuous').click();
  await expect(page.getByTestId('doc-view')).toHaveClass(/layout-continuous/);

  // La biblioteca no lo muestra; al volver a «Documentos» se abre el más reciente.
  await page.getByRole('tab', { name: 'Biblioteca' }).click();
  await expect(page.getByTestId('doc-view')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await expect(page.getByTestId('doc-editor').locator('strong')).toHaveText('uno');

  // Tras recargar sigue ahí, con su formato y la última vista elegida.
  await page.reload();
  await expect(page.getByTestId('doc-item')).toHaveCount(1);
  await expect(page.getByTestId('doc-view')).toHaveClass(/layout-continuous/);
  await expect(page.getByTestId('doc-editor').locator('h1')).toHaveText('Guion');
  await expect(page.getByTestId('doc-editor').locator('strong')).toHaveText('uno');
});
