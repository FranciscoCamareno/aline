import { expect, test, type Page } from '@playwright/test';

/**
 * Barra de herramientas propia (docs/DESIGN.md §7.1–7.2) y nota adhesiva (§3.5). La barra maneja
 * el motor por su API pública; aquí se comprueba que refleja su estado, que los atajos del motor
 * siguen funcionando y que la nota se guarda en la escena como elementos agrupados.
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
  await expect(page.getByTestId('tool-tray')).toBeVisible();
}

interface SceneEl {
  type: string;
  isDeleted?: boolean;
  groupIds: string[];
  backgroundColor: string;
  strokeColor: string;
  width: number;
  height: number;
}

/** Elementos vigentes de la cabeza del documento activo, leídos de IndexedDB. */
async function savedElements(page: Page): Promise<SceneEl[]> {
  return (JSON.parse(await savedBody(page)) as { elements: SceneEl[] }).elements.filter(
    (e) => !e.isDeleted,
  );
}

/** Escena JSON de la cabeza del documento activo. */
async function savedBody(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  const body = await page.evaluate(async (docId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = <T>(store: string, key: string) =>
      new Promise<T>((resolve) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result as T);
      });
    try {
      const doc = await get<{ headRevisionIds: string[] }>('documents', docId!);
      const rev = await get<{ contentRefs: { body: string } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
      return new TextDecoder().decode(blob.bytes);
    } finally {
      db.close();
    }
  }, id);
  return body;
}

test('la barra propia sustituye a la del motor y refleja la herramienta activa', async ({
  page,
}) => {
  await freshStart(page);
  // La barra del motor sigue en el árbol (por su texto de ayuda) pero no se ve.
  await expect(page.locator('.excalidraw .App-toolbar .Stack_horizontal').first()).toBeHidden();

  await expect(page.getByTestId('tool-selection')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Lápiz (P)' })).toBeVisible();

  await page.getByTestId('tool-freedraw').click();
  await expect(page.getByTestId('tool-freedraw')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-selection')).toHaveAttribute('aria-pressed', 'false');

  // Los atajos del motor siguen funcionando y la barra los refleja.
  await page.locator('.excalidraw').click({ position: { x: 600, y: 300 } });
  await page.keyboard.press('o');
  await expect(page.getByTestId('tool-shape')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-shape')).toHaveAccessibleName('Elipse (O)');
  await page.keyboard.press('v');
  await expect(page.getByTestId('tool-selection')).toHaveAttribute('aria-pressed', 'true');
  // La forma de la casilla se recuerda.
  await expect(page.getByTestId('tool-shape')).toHaveAccessibleName('Elipse (O)');

  // El candado es un interruptor.
  await page.getByTestId('tool-lock').click();
  await expect(page.getByTestId('tool-lock')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('tool-lock').click();
  await expect(page.getByTestId('tool-lock')).toHaveAttribute('aria-pressed', 'false');
});

test('menú de formas con teclado y panel secundario sin contenido web incrustado', async ({
  page,
}) => {
  await freshStart(page);
  const chevron = page.getByTestId('tool-shapes-menu');
  await expect(chevron).toHaveAttribute('aria-haspopup', 'menu');
  await chevron.click();
  const menu = page.getByRole('menu', { name: 'Formas' });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: /Rectángulo/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: /Rombo/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(chevron).toBeFocused();

  await chevron.click();
  await page.getByTestId('tool-menu-arrow').click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('tool-shape')).toHaveAccessibleName('Flecha (A)');
  await expect(page.getByTestId('tool-shape')).toHaveAttribute('aria-pressed', 'true');

  const more = page.getByTestId('tool-more');
  await expect(page.getByTestId('tool-secondary')).toHaveCount(0);
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const secondary = page.getByTestId('tool-secondary');
  await expect(secondary.getByRole('button')).toHaveCount(4);
  await expect(secondary.getByTestId('tool-frame')).toBeVisible();
  await expect(secondary.getByTestId('tool-laser')).toBeVisible();
  await expect(secondary.getByTestId('tool-image')).toBeVisible();
  await expect(secondary.getByTestId('tool-mermaid')).toBeVisible();
  await secondary.getByTestId('tool-frame').click();
  await expect(secondary.getByTestId('tool-frame')).toHaveAttribute('aria-pressed', 'true');

  // «Diagrama desde Mermaid» abre el diálogo del motor.
  await secondary.getByTestId('tool-mermaid').click();
  await expect(page.locator('.excalidraw .ttd-dialog')).toBeVisible();
});

test('nota adhesiva: se inserta agrupada, mantequilla, desde la barra y con N', async ({
  page,
}) => {
  await freshStart(page);
  await page.getByTestId('tool-sticky').click();
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  await expect.poll(async () => (await savedElements(page)).length).toBe(4);
  const note = await savedElements(page);
  const groups = new Set(note.map((e) => e.groupIds.join(',')));
  expect(groups.size).toBe(1);
  expect([...groups][0]).not.toBe('');
  const body = note.find((e) => e.type === 'rectangle' && e.width === 200)!;
  expect(body).toMatchObject({ backgroundColor: '#FFE380', strokeColor: '#262118', height: 200 });
  expect(note.filter((e) => e.type === 'line')).toHaveLength(2);

  await page.locator('.excalidraw').click({ position: { x: 300, y: 500 } });
  await page.keyboard.press('n');
  await expect.poll(async () => (await savedElements(page)).length).toBe(8);

  // Con el foco en un campo de texto, N no inserta nada.
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').press('n');
  await page.getByTestId('active-title-input').press('Escape');
  await page.waitForTimeout(700);
  expect(await savedElements(page)).toHaveLength(8);
});

test('se escribe dentro de la nota adhesiva con doble clic', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('tool-sticky').click();
  const box = (await page.locator('.excalidraw canvas.interactive').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Primer doble clic: entra en el grupo; segundo: edita el texto ligado al cuerpo.
  await page.mouse.dblclick(center.x, center.y);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.locator('.excalidraw-wysiwyg')).toBeVisible();
  await page.keyboard.type('Idea suelta');
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await savedElements(page)).filter((e) => e.type === 'text').length)
    .toBe(1);
  const text = (await savedElements(page)).find((e) => e.type === 'text')!;
  expect(text.groupIds).toEqual((await savedElements(page))[0]!.groupIds);
});

test('stickers: la casilla y B abren el selector; el sticker se guarda como imagen', async ({
  page,
}) => {
  await freshStart(page);
  const slot = page.getByTestId('tool-sticker');
  await expect(slot).toHaveAccessibleName('Stickers (B)');
  await slot.click();
  const picker = page.getByRole('dialog', { name: 'Stickers' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button')).toHaveCount(13);
  await expect(picker.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(slot).toBeFocused();

  await page.locator('.excalidraw').click({ position: { x: 600, y: 300 } });
  await page.keyboard.press('b');
  await expect(picker).toBeVisible();
  await page.getByTestId('sticker-corazon').click();
  await expect(picker).toBeHidden();
  await expect.poll(async () => (await savedElements(page)).length).toBe(1);
  const [sticker] = (await savedElements(page)) as Array<
    SceneEl & { fileId: string; angle: number }
  >;
  expect(sticker).toMatchObject({ type: 'image', width: 120, height: 120 });
  expect(Math.abs(sticker!.angle)).toBeLessThanOrEqual((10 * Math.PI) / 180 + 1e-9);
  // El archivo es el PNG del sticker (no un SVG, que el filtro oscuro invertiría).
  const files = (
    JSON.parse(await savedBody(page)) as { files: Record<string, { mimeType: string }> }
  ).files;
  expect(files[sticker!.fileId]?.mimeType).toBe('image/png');
});
