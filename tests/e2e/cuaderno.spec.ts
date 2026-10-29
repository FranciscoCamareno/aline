import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Cuaderno (plan 13): «Nuevo → Cuaderno», páginas como en GoodNotes, solo se dibuja dentro de las
 * páginas, añadir/duplicar/mover/borrar páginas, PDF con una página por página y convertir entre
 * lienzo y cuaderno. Chromium no valida el iPad ni el Apple Pencil.
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

interface El {
  id: string;
  type: string;
  frameId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted: boolean;
  locked: boolean;
}

/** Escena y sidecar de la cabeza vigente del documento abierto. */
async function saved(page: Page): Promise<{ elements: El[]; sidecar: Record<string, unknown> }> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  return page.evaluate(async (docId) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('mindnote-vault');
      r.onsuccess = () => resolve(r.result);
    });
    const get = <T>(store: string, key: string) =>
      new Promise<T>((resolve) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result as T);
      });
    const doc = await get<{ headRevisionIds: string[] }>('documents', docId!);
    const rev = await get<{ contentRefs: { body: string; extensions: string } }>(
      'revisions',
      doc.headRevisionIds[0]!,
    );
    const text = async (hash: string) =>
      new TextDecoder().decode((await get<{ bytes: Uint8Array }>('blobs', hash)).bytes);
    const scene = JSON.parse(await text(rev.contentRefs.body)) as { elements: El[] };
    const sidecar = JSON.parse(await text(rev.contentRefs.extensions)) as Record<string, unknown>;
    db.close();
    return { elements: scene.elements.filter((e) => !e.isDeleted), sidecar };
  }, id);
}

const pagesOf = (els: El[]) => els.filter((e) => e.type === 'frame').sort((a, b) => a.y - b.y);
const status = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

async function newNotebook(page: Page) {
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-notebook').click();
  await expect(page.getByTestId('new-notebook-dialog')).toBeVisible();
  await page.getByTestId('new-notebook-create').click();
  await expect(page.getByTestId('notebook-count')).toHaveText('Página 1 de 1');
  await expect(page.getByTestId('active-title-text')).toHaveText('Cuaderno sin título');
}

test('cuaderno: crear, dibujar solo dentro, páginas, PDF por páginas y convertir', async ({
  page,
}) => {
  await freshStart(page);
  await newNotebook(page);
  await expect
    .poll(async () => (await saved(page)).sidecar['notebook'])
    .toEqual({
      size: 'a4',
      orientation: 'portrait',
    });
  // Sin herramienta de marco: los marcos son las páginas.
  await expect(page.getByTestId('tool-frame')).toHaveCount(0);

  const host = (await page.getByTestId('canvas-host').boundingBox())!;
  const mid = host.x + host.width / 2;
  await page.mouse.click(mid, host.y + 450); // foco en el lienzo
  // Dentro de la página: se dibuja y es parte de ella.
  await page.keyboard.press('r');
  await page.mouse.move(mid - 100, host.y + 200);
  await page.mouse.down();
  await page.mouse.move(mid + 50, host.y + 300, { steps: 6 });
  await page.mouse.up();
  // En la mesa (a la derecha de la página): no se dibuja nada.
  await page.keyboard.press('r');
  await page.mouse.move(host.x + host.width - 70, host.y + 400);
  await page.mouse.down();
  await page.mouse.move(host.x + host.width - 20, host.y + 460, { steps: 6 });
  await page.mouse.up();
  await status(page);
  let state = await saved(page);
  const [first] = pagesOf(state.elements);
  expect(first!.locked).toBe(true);
  expect(state.elements.filter((e) => e.type === 'rectangle')).toHaveLength(1);
  expect(state.elements.find((e) => e.type === 'rectangle')!.frameId).toBe(first!.id);

  // Arrastrar el rectángulo a la mesa: vuelve dentro de su página.
  await page.keyboard.press('v');
  await page.mouse.move(mid - 100, host.y + 250);
  await page.mouse.down();
  await page.mouse.move(host.x + host.width - 60, host.y + 250, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const rect = (await saved(page)).elements.find((e) => e.type === 'rectangle')!;
      return rect.x + rect.width <= first!.x + first!.width + 1;
    })
    .toBe(true);

  // Añadir una página (y deshacerlo de un paso), duplicar, mover y borrar.
  await page.getByTestId('notebook-add-page').click();
  await expect(page.getByTestId('notebook-count')).toHaveText('Página 2 de 2');
  // Tras la operación el foco vuelve al lienzo: Ctrl/⌘+Z la deshace en un paso.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('notebook-count')).toHaveText(/de 1$/);
  await page.getByTestId('notebook-add-page').click();
  await expect(page.getByTestId('notebook-count')).toHaveText(/de 2$/);
  await page.getByTestId('notebook-pages-toggle').click();
  const panel = page.getByTestId('notebook-panel');
  await expect(panel.getByTestId('notebook-page')).toHaveCount(2);
  await panel.getByTestId('notebook-page').first().getByTestId('notebook-page-duplicate').click();
  await expect(panel.getByTestId('notebook-page')).toHaveCount(3);
  await status(page);
  state = await saved(page);
  expect(pagesOf(state.elements)).toHaveLength(3);
  // La copia (página 2) lleva su propio rectángulo, dentro de ella.
  const copyPage = pagesOf(state.elements)[1]!;
  expect(
    state.elements.filter((e) => e.type === 'rectangle' && e.frameId === copyPage.id),
  ).toHaveLength(1);
  await panel.getByTestId('notebook-page').nth(2).getByTestId('notebook-page-up').click();
  await panel.getByTestId('notebook-page').nth(1).getByTestId('notebook-page-delete').click();
  await panel.getByTestId('notebook-page-delete-confirm').click();
  await expect(panel.getByTestId('notebook-page')).toHaveCount(2);
  await expect(page.getByTestId('notebook-count')).toHaveText(/de 2$/);
  await page.getByTestId('notebook-next').click();
  await expect(page.getByTestId('notebook-count')).toHaveText('Página 2 de 2');
  await page.getByTestId('notebook-previous').click();
  await expect(page.getByTestId('notebook-count')).toHaveText('Página 1 de 2');

  // PDF: una página por página del cuaderno.
  await page.getByTestId('export-menu').click();
  await page.getByTestId('canvas-export').click();
  await page.getByTestId('export-format-pdf').check();
  await expect(page.getByTestId('export-pdf-pages')).toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const pdf = (await readFile((await (await download).path())!)).toString('latin1');
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);

  // Tras recargar sigue siendo un cuaderno.
  await page.reload();
  await expect(page.getByTestId('notebook-count')).toHaveText(/de 2$/);

  // Convertir en lienzo infinito y, otra vez, en cuaderno.
  await page.getByTestId('canvas-background').click();
  await page.getByTestId('canvas-to-infinite').click();
  await expect(page.getByTestId('notebook-count')).toHaveCount(0);
  await status(page);
  await expect.poll(async () => (await saved(page)).sidecar['notebook']).toBeUndefined();
  expect(pagesOf((await saved(page)).elements)).toHaveLength(0);
  await page.getByTestId('canvas-background').click();
  await page.getByTestId('canvas-to-notebook').click();
  await page.getByTestId('notebook-orientation-landscape').check();
  await page.getByTestId('new-notebook-create').click();
  await expect(page.getByTestId('notebook-count')).toHaveText(/Página 1 de \d+/);
  await status(page);
  await expect
    .poll(async () => {
      const s = await saved(page);
      const pages = pagesOf(s.elements);
      return [
        pages.length > 0,
        pages[0]?.width,
        s.elements.filter((e) => e.type === 'rectangle').every((e) => e.frameId),
      ];
    })
    .toEqual([true, 1123, true]);
});

test('cuaderno: tamaño Carta en horizontal desde «Nuevo»', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-notebook').click();
  await page.getByTestId('notebook-size-letter').check();
  await page.getByTestId('notebook-orientation-landscape').check();
  await page.getByTestId('new-notebook-create').click();
  await expect(page.getByTestId('notebook-count')).toHaveText('Página 1 de 1');
  await status(page);
  const [frame] = pagesOf((await saved(page)).elements);
  expect([frame!.width, frame!.height]).toEqual([1056, 816]);
});
