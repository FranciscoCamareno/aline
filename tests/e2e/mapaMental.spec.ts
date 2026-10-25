import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Mapa mental en el lienzo (diseño §9.1, plan 9.22–9.23): crear un hijo conectado con Tab
 * (RF-14, CA-04) y plegar y desplegar ramas con la estrategia B de la fase 0 (RF-15, CA-05). Las
 * coordenadas de escena coinciden con las de pantalla menos el origen del lienzo.
 */
test.use({ locale: 'es-ES' });

interface SceneEl {
  id: string;
  type: string;
  x: number;
  y: number;
  opacity: number;
  locked: boolean;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}

interface MindMap {
  parentByNode: Record<string, string>;
  collapsedNodeIds: string[];
  hidden?: Record<string, { opacity: number; locked: boolean }>;
  badges?: Record<string, string>;
}

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.setItem('mindnote.welcome', '1');
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

/** Escena y sidecar de la versión vigente del lienzo abierto, leídos de IndexedDB. */
async function saved(page: Page): Promise<{ elements: SceneEl[]; mindMap: MindMap }> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  return page.evaluate(async (docId) => {
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
      const rev = await get<{ contentRefs: { body: string; extensions: string } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const text = async (hash: string) =>
        new TextDecoder().decode((await get<{ bytes: Uint8Array }>('blobs', hash)).bytes);
      const scene = JSON.parse(await text(rev.contentRefs.body)) as { elements: SceneEl[] };
      const ext = JSON.parse(await text(rev.contentRefs.extensions)) as { mindMap: MindMap };
      return { elements: scene.elements.filter((e) => !e.isDeleted), mindMap: ext.mindMap };
    } finally {
      db.close();
    }
  }, id);
}

async function origin(page: Page) {
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  return { x: box.x, y: box.y };
}

/** Un rectángulo de 120 × 60 con su esquina en (x, y) de la escena; queda seleccionado. */
async function node(page: Page, x: number, y: number) {
  const o = await origin(page);
  // Foco en el lienzo, fuera del panel de propiedades del motor (a la izquierda).
  await page.mouse.click(o.x + 700, o.y + 520);
  await page.keyboard.press('r');
  await page.mouse.move(o.x + x, o.y + y);
  await page.mouse.down();
  await page.mouse.move(o.x + x + 120, o.y + y + 60, { steps: 6 });
  await page.mouse.up();
}

/** Selecciona la forma cuyo borde pasa por (x, y): sin relleno, el interior no la selecciona. */
async function select(page: Page, x: number, y: number) {
  const o = await origin(page);
  await page.keyboard.press('Escape');
  await page.mouse.click(o.x + x, o.y + y);
}

/** Tab crea el hijo y empieza a escribir en él; Escape termina. */
async function child(page: Page, label: string) {
  await page.keyboard.press('Tab');
  await expect(page.locator('.excalidraw-wysiwyg')).toBeVisible();
  await page.keyboard.type(label);
  await page.keyboard.press('Escape');
  await expect(page.locator('.excalidraw-wysiwyg')).toHaveCount(0);
}

const shapes = (els: SceneEl[]) => els.filter((e) => e.type === 'rectangle');
const labelOf = (els: SceneEl[], id: string) =>
  els.find((e) => e.type === 'text' && e.containerId === id)?.text;
/** Texto sin los saltos de línea con los que el motor lo ajusta a su forma. */
const sourceOf = (els: SceneEl[], id: string) =>
  els.find((e) => e.type === 'text' && e.containerId === id)?.originalText;

test('Tab crea un hijo conectado listo para escribir; un solo deshacer lo quita (CA-04)', async ({
  page,
}) => {
  await freshStart(page);
  await node(page, 300, 200);
  await child(page, 'Hijo');
  // El hijo se guarda en cuanto se crea (vacío) y su texto en un guardado posterior: se espera
  // a ese, o en una máquina lenta se leería la revisión anterior.
  await expect
    .poll(async () => (await saved(page)).elements.some((e) => e.text === 'Hijo'))
    .toBe(true);
  const { elements, mindMap } = await saved(page);
  expect(shapes(elements)).toHaveLength(2);
  const [parent, kid] = shapes(elements).sort((a, b) => a.x - b.x);
  expect(kid!.x).toBeGreaterThan(parent!.x + 120);
  expect(labelOf(elements, kid!.id)).toBe('Hijo');
  // La flecha está anclada a los dos, y el árbol del sidecar lo registra.
  const arrow = elements.find((e) => e.type === 'arrow')!;
  expect([arrow.startBinding?.elementId, arrow.endBinding?.elementId]).toEqual([
    parent!.id,
    kid!.id,
  ]);
  expect(mindMap.parentByNode).toEqual({ [kid!.id]: parent!.id });

  // Un segundo hijo va debajo del primero.
  await select(page, 300, 230);
  await child(page, 'Otro');
  await expect
    .poll(async () => (await saved(page)).elements.some((e) => e.text === 'Otro'))
    .toBe(true);
  const now = (await saved(page)).elements;
  const third = shapes(now).find((e) => labelOf(now, e.id) === 'Otro')!;
  expect(third.x).toBe(kid!.x);
  expect(third.y).toBeGreaterThan(kid!.y + 60);

  // Sin escribir nada, un deshacer quita el hijo con su flecha (es un solo comando).
  await select(page, 300, 230);
  await page.keyboard.press('Tab');
  await expect(page.locator('.excalidraw-wysiwyg')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => shapes((await saved(page)).elements)).toHaveLength(4);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => shapes((await saved(page)).elements)).toHaveLength(3);
  expect((await saved(page)).elements.filter((e) => e.type === 'arrow')).toHaveLength(2);
});

test('plegar y desplegar una rama de tres niveles conserva posiciones, se guarda y no se exporta (CA-05)', async ({
  page,
}) => {
  await freshStart(page);
  await node(page, 300, 200); // R
  await child(page, 'Rama');
  await child(page, 'Nieto'); // el hijo queda seleccionado: Tab crea el nieto
  await expect.poll(async () => shapes((await saved(page)).elements)).toHaveLength(3);
  const before = (await saved(page)).elements;
  const [root, branch, grand] = shapes(before).sort((a, b) => a.x - b.x);

  // Plegar R: hijo, nieto, sus textos y flechas quedan ocultos y bloqueados; R muestra «+2».
  await select(page, 300, 230);
  await expect(page.getByTestId('toggle-branch')).toHaveText(/Plegar rama \(2\)/);
  await page.getByTestId('toggle-branch').click();
  await expect(page.getByTestId('toggle-branch')).toHaveText(/Desplegar rama \(2 ocultos\)/);
  await expect.poll(async () => (await saved(page)).mindMap.collapsedNodeIds).toEqual([root!.id]);
  let state = await saved(page);
  const hiddenIds = Object.keys(state.mindMap.hidden ?? {});
  expect(hiddenIds).toEqual(expect.arrayContaining([branch!.id, grand!.id]));
  expect(hiddenIds).toHaveLength(6); // 2 nodos, 2 textos, 2 flechas
  for (const id of hiddenIds) {
    expect(state.elements.find((e) => e.id === id)).toMatchObject({ opacity: 0, locked: true });
  }
  const badge = state.elements.find((e) => e.id === state.mindMap.badges?.[root!.id]);
  expect(badge?.text).toBe('+2');

  // La exportación SVG no lleva lo oculto.
  await page.getByTestId('export-menu').click();
  await page.getByTestId('canvas-export').click();
  await page.getByTestId('export-format-svg').check();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const svg = await readFile((await (await download).path())!, 'utf8');
  expect(svg).not.toContain('Rama');
  expect(svg).not.toContain('Nieto');

  // Recargar: sigue plegada. Desplegar restaura todo donde estaba.
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await select(page, 300, 230);
  await page.getByTestId('toggle-branch').click();
  await expect.poll(async () => (await saved(page)).mindMap.collapsedNodeIds).toEqual([]);
  state = await saved(page);
  for (const original of before) {
    const now = state.elements.find((e) => e.id === original.id)!;
    expect(now).toMatchObject({ opacity: 100, locked: false });
    // Nodos y textos, en su sitio exacto; las flechas ancladas el motor las recoloca (≤ 1 px).
    const tolerance = original.type === 'arrow' ? 1 : 0;
    expect(Math.abs(now.x - original.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(now.y - original.y)).toBeLessThanOrEqual(tolerance);
  }
  expect(state.elements.some((e) => e.text === '+2')).toBe(false);
  expect(state.mindMap.hidden).toBeUndefined();
});

test('deshacer muchas veces con una rama plegada no pierde ni muestra nada (fase 0, §3.6)', async ({
  page,
}) => {
  await freshStart(page);
  await node(page, 300, 200);
  await child(page, 'Rama');
  await child(page, 'Nieto');
  await expect.poll(async () => shapes((await saved(page)).elements)).toHaveLength(3);
  const all = (await saved(page)).elements.map((e) => e.id).sort();

  await select(page, 300, 230);
  await page.getByTestId('toggle-branch').click();
  await expect.poll(async () => (await saved(page)).mindMap.collapsedNodeIds).toHaveLength(1);
  // Deshacer sin parar: el historial del motor deshace lo anterior (textos, hijos…), pero la
  // proyección vuelve a ocultar lo que queda bajo la rama y nada se borra en silencio.
  await page.keyboard.press('Escape');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ControlOrMeta+z');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.waitForTimeout(500);
  const state = await saved(page);
  const live = state.elements.map((e) => e.id);
  expect(live).toEqual(expect.arrayContaining(all));
  for (const id of Object.keys(state.mindMap.hidden ?? {})) {
    expect(state.elements.find((e) => e.id === id)).toMatchObject({ opacity: 0, locked: true });
  }
  // Y al desplegar, todo vuelve.
  await select(page, 300, 230);
  await page.getByTestId('toggle-branch').click();
  await expect.poll(async () => (await saved(page)).mindMap.collapsedNodeIds).toEqual([]);
  for (const e of (await saved(page)).elements) {
    expect(e).toMatchObject({ opacity: 100, locked: false });
  }
});

test('tarjeta de nota: elementos nativos con el título y el extracto, que siguen a la nota (RF-18)', async ({
  page,
}) => {
  await freshStart(page);
  const canvasId = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  // Una nota con título y texto.
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await page.locator('.cm-content').click();
  await page.keyboard.type('Primera idea con **negrita**');
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').fill('Ideas');
  await page.getByTestId('active-title-input').press('Enter');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  const noteId = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');

  // De vuelta al lienzo: «Tarjeta de nota» solo ofrece notas.
  await page.locator(`[data-document-id="${canvasId}"]`).getByTestId('library-title-text').click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await page.getByTestId('insert-note-card').click();
  await page.getByTestId('link-search').fill('Ideas');
  await page.getByTestId('link-candidate').filter({ hasText: 'Ideas' }).click();
  await expect
    .poll(async () => (await saved(page)).elements.filter((e) => e.type === 'rectangle').length)
    .toBe(1);
  let state = await saved(page);
  const card = state.elements.find((e) => e.type === 'rectangle')! as SceneEl & { link?: string };
  expect(card.link).toBe(`aline://document/${noteId}`);
  // Título y extracto del texto mostrado (sin marcas de Markdown ni el encabezado de la plantilla
  // si repite el título; aquí no lo repite, porque la nota se renombró).
  expect(sourceOf(state.elements, card.id)).toMatch(/^Ideas\n\n.*Primera idea con negrita$/);

  // Cambiar la nota actualiza la tarjeta sin cambiar su identidad.
  await page.getByTestId('library-title-text').filter({ hasText: 'Ideas' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Texto nuevo');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  await page.locator(`[data-document-id="${canvasId}"]`).getByTestId('library-title-text').click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect
    .poll(async () => sourceOf((await saved(page)).elements, card.id))
    .toBe('Ideas\n\nTexto nuevo');
  state = await saved(page);
  expect(state.elements.find((e) => e.type === 'rectangle')!.id).toBe(card.id);
});

test('deshacer y rehacer un hijo conservan su relación en el árbol (una sola pila, §9.2)', async ({
  page,
}) => {
  await freshStart(page);
  await node(page, 300, 200);
  await child(page, 'Uno');
  await expect
    .poll(async () => Object.keys((await saved(page)).mindMap.parentByNode))
    .toHaveLength(1);
  const [kidId] = Object.keys((await saved(page)).mindMap.parentByNode);

  // Deshacer el texto y el hijo; rehacer los dos: el hijo vuelve con el mismo id y su relación.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => shapes((await saved(page)).elements)).toHaveLength(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => shapes((await saved(page)).elements)).toHaveLength(2);
  const state = await saved(page);
  expect(state.mindMap.parentByNode[kidId!]).toBeDefined();
  expect(labelOf(state.elements, kidId!)).toBe('Uno');

  // Borrar el hijo: el padre deja de ofrecer «Plegar rama» (no le quedan hijos vivos). La
  // relación se conserva mientras dura la sesión, porque deshacer puede devolver el hijo.
  await select(page, 300, 230);
  await expect(page.getByTestId('toggle-branch')).toHaveText(/Plegar rama \(1\)/);
  // Por su borde superior: en el izquierdo está la punta de la flecha.
  await select(page, 560, 200);
  await page.keyboard.press('Delete');
  await select(page, 300, 230);
  await expect(page.getByTestId('link-element')).toBeVisible();
  await expect(page.getByTestId('toggle-branch')).toHaveCount(0);
});
