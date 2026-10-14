import { expect, test, type Page } from '@playwright/test';

/**
 * Plan 5.4 y 5.5: uso con teclado, foco visible y adaptación táctil (RF-49, RNF-08). La
 * emulación táctil de Chromium no sustituye la prueba en un iPad real con Safari.
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

test('solo con teclado: llegar a «Nota», crearla y escribir, con el foco siempre visible', async ({
  page,
}) => {
  await freshStart(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'new-menu',
    );
  }
  expect(reached).toBe(true);
  const outlineOf = () =>
    page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(await outlineOf()).not.toBe('none');
  // «Nuevo» abre su menú con Intro y deja el foco en el primer elemento (Lienzo).
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('new-canvas')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('new-note')).toBeFocused();
  expect(await outlineOf()).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('escrito solo con el teclado');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
});

test.describe('pantalla táctil estrecha (iPad vertical emulado)', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test('objetivos de 44 px, campos de 16 px y biblioteca superpuesta que se cierra sola', async ({
    page,
  }) => {
    await freshStart(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const toggle = page.getByRole('button', { name: /biblioteca/i });
    if (!(await page.locator('.library').isVisible())) await toggle.tap();
    await expect(page.locator('.library')).toBeVisible();

    // Todos los botones visibles de la interfaz propia miden al menos 44 × 44 px.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.topbar button, .library button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({ text: b.textContent?.trim() ?? '', ...b.getBoundingClientRect().toJSON() }))
        .filter((r) => r.height < 44 || r.width < 44)
        .map((r) => `${r.text} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);

    // Crear una nota cierra la biblioteca (taparía el editor) y el editor no provoca zoom.
    await page.getByTestId('new-menu').tap();
    await page.getByTestId('new-note').tap();
    await expect(page.locator('.library')).toBeHidden();
    await expect(page.locator('.cm-content')).toBeVisible();
    const fontSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.cm-editor')!).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);

    // Tocar fuera la cierra; deslizar a la izquierda también.
    await toggle.tap();
    await expect(page.locator('.library')).toBeVisible();
    await page.locator('.library-backdrop').tap({ position: { x: 700, y: 600 } });
    await expect(page.locator('.library')).toBeHidden();
    await toggle.tap();
    const box = (await page.locator('.library').boundingBox())!;
    await page.locator('.library').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: box.x + 200,
      clientY: box.y + 300,
    });
    await page.locator('.library').dispatchEvent('pointerup', {
      pointerType: 'touch',
      clientX: box.x + 40,
      clientY: box.y + 310,
    });
    await expect(page.locator('.library')).toBeHidden();
  });
});
