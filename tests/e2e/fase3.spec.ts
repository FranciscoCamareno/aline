import { expect, test, type Page } from '@playwright/test';

/**
 * Fase 3 en navegador: capacidades del lienzo, carpetas y etiquetas, enlaces, backlinks y
 * búsqueda. Las coordenadas de escena coinciden con las de pantalla menos el origen del lienzo
 * (zoom 1 y sin desplazamiento al abrir).
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

async function activeId(page: Page): Promise<string> {
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  expect(id).toBeTruthy();
  return id!;
}

/** Lee de IndexedDB el cuerpo de la cabeza vigente (escena JSON o Markdown). */
async function headBody(page: Page, documentId: string): Promise<string> {
  return page.evaluate(async (id) => {
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
      const doc = await get<{ headRevisionIds: string[] }>('documents', id);
      const rev = await get<{ contentRefs: { body: string } }>(
        'revisions',
        doc.headRevisionIds[0]!,
      );
      const blob = await get<{ bytes: Uint8Array }>('blobs', rev.contentRefs.body);
      return new TextDecoder().decode(blob.bytes);
    } finally {
      db.close();
    }
  }, documentId);
}

interface SceneEl {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  text?: string;
  containerId?: string | null;
  link?: string | null;
  points?: [number, number][];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  fileId?: string;
}

async function scene(
  page: Page,
  documentId: string,
): Promise<{ elements: SceneEl[]; files?: Record<string, unknown> }> {
  return JSON.parse(await headBody(page, documentId)) as { elements: SceneEl[] };
}

async function revisionCount(page: Page, documentId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
    });
    const count = await new Promise<number>((resolve) => {
      const r = db.transaction('revisions').objectStore('revisions').index('documentId').count(id);
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return count;
  }, documentId);
}

async function origin(page: Page) {
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  return { x: box.x, y: box.y };
}

/** Dibuja con una herramienta del motor arrastrando entre dos puntos de escena. */
async function draw(page: Page, key: string, from: [number, number], to: [number, number]) {
  const o = await origin(page);
  await page.keyboard.press(key);
  await page.mouse.move(o.x + from[0], o.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(o.x + to[0], o.y + to[1], { steps: 8 });
  await page.mouse.up();
}

async function focusCanvas(page: Page) {
  const o = await origin(page);
  await page.mouse.click(o.x + 120, o.y + 560);
}

async function saved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
}

async function newNote(page: Page, text: string): Promise<string> {
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await saved(page);
  return activeId(page);
}

async function renameActive(page: Page, title: string) {
  await page.getByTestId('active-title-rename').click();
  await page.getByTestId('active-title-input').fill(title);
  await page.getByTestId('active-title-input').press('Enter');
  await expect(page.getByTestId('active-title-text')).toHaveText(title);
}

test('primera captura en menos de 10 s sin cuenta ni configuración (CA-01)', async ({ page }) => {
  const start = Date.now();
  await page.goto('/');
  await expect(page.locator('.excalidraw')).toBeVisible();
  const o = await origin(page);
  await page.mouse.dblclick(o.x + 500, o.y + 300);
  await page.keyboard.type('Primera idea');
  await page.keyboard.press('Escape');
  const id = await activeId(page);
  await expect
    .poll(async () => (await scene(page, id)).elements.some((e) => e.text === 'Primera idea'))
    .toBe(true);
  const ms = Date.now() - start;
  console.log(`[CA-01] de abrir a texto guardado: ${ms} ms`);
  expect(ms).toBeLessThan(10_000);
});

test('formas, duplicar, mover y borrar se conservan al reabrir (CA-T01)', async ({ page }) => {
  await freshStart(page);
  const id = await activeId(page);
  await focusCanvas(page);
  await draw(page, 'r', [300, 150], [420, 230]);
  await page.keyboard.press('ControlOrMeta+d'); // duplica el rectángulo recién dibujado
  await draw(page, 'o', [500, 150], [620, 230]);
  await draw(page, 'd', [700, 150], [820, 230]);
  await page.keyboard.press('Shift+ArrowRight'); // mueve el rombo seleccionado
  await page.keyboard.press('Shift+ArrowRight');
  await draw(page, 'l', [300, 330], [450, 380]);
  await draw(page, 'a', [500, 330], [650, 380]);
  await draw(page, 'o', [700, 330], [800, 400]);
  await page.keyboard.press('Delete'); // borra la segunda elipse
  // Se espera a que el borrado esté en IndexedDB: el estado visible podría seguir mostrando el
  // guardado anterior durante el instante previo a que el motor notifique el cambio.
  await expect
    .poll(async () => (await scene(page, id)).elements.filter((e) => !e.isDeleted).length)
    .toBe(6);

  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  const els = (await scene(page, id)).elements.filter((e) => !e.isDeleted);
  expect(els.map((e) => e.type).sort()).toEqual([
    'arrow',
    'diamond',
    'ellipse',
    'line',
    'rectangle',
    'rectangle',
  ]);
  const diamond = els.find((e) => e.type === 'diamond')!;
  expect(diamond.x).toBeGreaterThan(700);
});

test('desplazar y hacer zoom no crea versiones (CA-T02)', async ({ page }) => {
  await freshStart(page);
  const id = await activeId(page);
  await focusCanvas(page);
  await draw(page, 'r', [300, 150], [420, 230]);
  await saved(page);
  const before = await revisionCount(page, id);
  const o = await origin(page);
  await page.mouse.move(o.x + 600, o.y + 400);
  await page.mouse.wheel(0, 400);
  await page.mouse.wheel(300, 0);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await page.waitForTimeout(2500);
  expect(await revisionCount(page, id)).toBe(before);
});

test('conector anclado con etiqueta sigue al nodo; al borrarlo queda suelto (CA-02, CA-03, RN-07)', async ({
  page,
}) => {
  await freshStart(page);
  const id = await activeId(page);
  await focusCanvas(page);
  await draw(page, 'r', [250, 200], [370, 280]);
  await draw(page, 'r', [650, 200], [770, 280]);
  await draw(page, 'a', [372, 240], [648, 240]); // de borde a borde: el motor ancla ambos extremos
  // Etiqueta en el conector: doble clic sobre la flecha y escribir.
  const o = await origin(page);
  await page.mouse.dblclick(o.x + 515, o.y + 240);
  await page.keyboard.type('causa');
  await page.keyboard.press('Escape');
  await saved(page);

  let els = (await scene(page, id)).elements.filter((e) => !e.isDeleted);
  const arrow = els.find((e) => e.type === 'arrow')!;
  const [a, b] = els.filter((e) => e.type === 'rectangle').sort((p, q) => p.x - q.x);
  expect(arrow.startBinding?.elementId).toBe(a!.id);
  expect(arrow.endBinding?.elementId).toBe(b!.id);
  expect(els.find((e) => e.type === 'text')?.containerId).toBe(arrow.id);

  // Mover B con el ratón: la flecha sigue anclada y su extremo se desplaza.
  await page.mouse.move(o.x + 770, o.y + 260); // borde derecho de B
  await page.mouse.down();
  await page.mouse.move(o.x + 870, o.y + 360, { steps: 10 });
  await page.mouse.up();
  await saved(page);
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  els = (await scene(page, id)).elements.filter((e) => !e.isDeleted);
  const movedB = els.find((e) => e.id === b!.id)!;
  const arrow2 = els.find((e) => e.id === arrow.id)!;
  expect(movedB.x).toBeGreaterThan(b!.x + 50);
  expect(arrow2.endBinding?.elementId).toBe(b!.id);
  const end = arrow2.points!.at(-1)!;
  expect(Math.abs(arrow2.x + end[0] - movedB.x)).toBeLessThan(40);
  expect(els.find((e) => e.type === 'text')?.containerId).toBe(arrow.id);

  // Borrar B: el conector se conserva, suelto y señalado (RN-07).
  const o2 = await origin(page);
  await page.mouse.click(o2.x + movedB.x + movedB.width, o2.y + movedB.y + movedB.height / 2);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('dangling-connectors')).toContainText('1');
  els = (await scene(page, id)).elements.filter((e) => !e.isDeleted);
  expect(els.some((e) => e.id === arrow.id)).toBe(true);
  await page.getByTestId('dangling-connectors').click();
  await expect(page.getByTestId('link-element')).toBeVisible(); // un único elemento seleccionado
});

test('una imagen pegada se conserva al reabrir (CA-24)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await freshStart(page);
  const id = await activeId(page);
  await focusCanvas(page);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#5b57d1';
    ctx.fillRect(0, 0, 40, 30);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  await page.keyboard.press('ControlOrMeta+v');
  // El motor añade el archivo un instante después del elemento: se espera a que ambos estén guardados.
  await expect
    .poll(async () => {
      const s = await scene(page, id);
      const image = s.elements.find((e) => e.type === 'image');
      return Boolean(image?.fileId && s.files?.[image.fileId]);
    })
    .toBe(true);
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
  const s = await scene(page, id);
  const image = s.elements.find((e) => e.type === 'image')!;
  const file = s.files?.[image.fileId!] as { dataURL: string } | undefined;
  expect(file?.dataURL).toMatch(/^mindnote-asset:[0-9a-f]{64}$/);
});

test('lienzo: [[ al escribir un texto lo enlaza, y en un texto vacío crea el título enlazado (plan 9.5)', async ({
  page,
}) => {
  await freshStart(page);
  const canvasId = await activeId(page);
  const noteId = await newNote(page, 'contenido del destino');
  await renameActive(page, 'Destino');
  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await focusCanvas(page);
  const o = await origin(page);
  const wiki = async () => {
    await page.keyboard.type('[[');
    await expect(page.getByTestId('link-picker')).toBeVisible();
    await page.keyboard.type('Dest');
    await page.getByTestId('link-candidate').filter({ hasText: 'Destino' }).click();
    await expect(page.getByTestId('link-picker')).toBeHidden();
  };
  const link = `aline://document/${noteId}`;
  const texts = async () =>
    (await scene(page, canvasId)).elements.filter((e) => e.type === 'text' && !e.isDeleted);

  // Un texto con contenido: el texto queda sin corchetes y con el enlace.
  await page.keyboard.press('t');
  await page.mouse.click(o.x + 300, o.y + 200);
  await expect(page.locator('.excalidraw-wysiwyg')).toBeVisible();
  await page.keyboard.type('Ver ');
  await wiki();
  await expect
    .poll(async () => (await texts()).map((e) => [e.text?.trim(), e.link]))
    .toEqual([['Ver', link]]);

  // Un texto vacío: el motor lo descarta y se crea uno con el título enlazado.
  await page.keyboard.press('t');
  await page.mouse.click(o.x + 300, o.y + 380);
  await expect(page.locator('.excalidraw-wysiwyg')).toBeVisible();
  await wiki();
  await expect
    .poll(async () => (await texts()).map((e) => [e.text?.trim(), e.link]))
    .toEqual([
      ['Ver', link],
      ['Destino', link],
    ]);
});

test('vincular un elemento a una nota, ver el backlink y renombrar sin romperlo (CA-06, CA-07)', async ({
  page,
}) => {
  await freshStart(page);
  const canvasId = await activeId(page);
  const noteId = await newNote(page, 'contenido del destino');
  await renameActive(page, 'Destino');

  await page.getByTestId('library-title-text').filter({ hasText: 'Lienzo sin título' }).click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await focusCanvas(page);
  await draw(page, 'r', [300, 200], [440, 280]);
  await page.getByTestId('link-element').click();
  await page.getByTestId('link-search').fill('Dest');
  await page.getByTestId('link-candidate').filter({ hasText: 'Destino' }).click();
  await saved(page);
  await expect
    .poll(
      async () => (await scene(page, canvasId)).elements.find((e) => e.type === 'rectangle')?.link,
    )
    .toBe(`aline://document/${noteId}`);

  // Backlink en la nota de destino; al pulsarlo se abre el lienzo con el elemento seleccionado.
  await page.getByTestId('library-title-text').filter({ hasText: 'Destino' }).click();
  await page.getByTestId('open-details').click();
  const backlinks = page.getByTestId('backlinks');
  await expect(backlinks).toContainText('Lienzo sin título');

  await renameActive(page, 'Destino renombrado');
  await expect(backlinks).toContainText('Lienzo sin título');
  await backlinks.getByRole('button').first().click();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect(page.getByTestId('link-element')).toBeVisible();

  // Pulsar el icono de enlace del elemento abre la nota renombrada (el enlace usa el UUID).
  // Al recargar, el lienzo vuelve sin desplazamiento y las coordenadas de escena son las de pantalla.
  await page.reload();
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect(page.locator('.excalidraw')).toBeVisible();
  const rect = (await scene(page, canvasId)).elements.find((e) => e.type === 'rectangle')!;
  const o = await origin(page);
  await page.mouse.click(o.x + rect.x + rect.width + 8, o.y + rect.y - 8);
  await expect(page.getByTestId('active-title-text')).toHaveText('Destino renombrado');
  expect(await activeId(page)).toBe(noteId);
});

test('[[ sugiere destinos, crea la nota si falta y los enlaces rotos se listan (RF-21, CA-08)', async ({
  page,
}) => {
  await freshStart(page);
  const targetId = await newNote(page, 'objetivo');
  await renameActive(page, 'Plan trimestral');
  const sourceId = await newNote(page, 'Ver ');

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('[[Plan');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('Plan trimestral');
  // CodeMirror ignora Enter durante sus primeros 75 ms (interactionDelay), para no aceptar sin querer.
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type(' y ');
  await page.keyboard.type('[[Idea nueva');
  await page.locator('.cm-tooltip-autocomplete li').filter({ hasText: 'Crear nota' }).click();
  await expect(editor).toContainText('[Idea nueva](aline://document/');
  await saved(page);
  const body = await headBody(page, sourceId);
  expect(body).toContain(`[Plan trimestral](aline://document/${targetId})`);

  // El enlace de la vista previa abre el destino.
  await page.getByTestId('note-preview').getByRole('link', { name: 'Plan trimestral' }).click();
  expect(await activeId(page)).toBe(targetId);

  // Enviar el destino a la papelera: el enlace aparece como roto.
  const target = page.locator(`[data-testid="library-item"][data-document-id="${targetId}"]`);
  await target.getByTestId('library-actions').click();
  await target.getByTestId('library-trash').click();
  await page
    .locator(`[data-testid="library-item"][data-document-id="${sourceId}"]`)
    .getByTestId('library-title-text')
    .click();
  await page.getByTestId('open-details').click();
  await expect(page.getByTestId('broken-links')).toContainText('Plan trimestral');
  await expect(page.getByTestId('outgoing-links')).toContainText('destino en la papelera');
});

test('carpetas, etiquetas y carpeta de recuperación (RF-25, CA-21)', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-input').fill('Proyectos');
  await page.getByTestId('new-folder-input').press('Enter');
  const folder = page.getByTestId('folder-item').filter({ hasText: 'Proyectos' });
  await expect(folder).toBeVisible();
  await folder.getByTestId('folder-title-text').click(); // la selecciona para crear dentro
  await expect(folder.locator('.folder-row')).toHaveClass(/selected/);
  const noteId = await newNote(page, 'nota dentro de la carpeta');
  await expect(
    folder.locator(`[data-testid="library-item"][data-document-id="${noteId}"]`),
  ).toBeVisible();

  await page.getByTestId('open-details').click();
  await page.getByTestId('tag-input').fill('Idea');
  await page.getByTestId('tag-input').press('Enter');
  await expect(page.getByTestId('tag-list')).toContainText('#Idea');
  await page.getByTestId('tag-chip').filter({ hasText: '#Idea' }).click();
  await expect(page.getByTestId('tag-results')).toContainText('Nota sin título');
  expect(await headBody(page, noteId)).toContain('tags: ["Idea"]');
  await page.getByTestId('tag-chip').filter({ hasText: '#Idea' }).click();

  // Borrar la carpeta no borra la nota: pasa a «Recuperación».
  await folder.getByTestId('folder-actions').first().click();
  await folder.getByTestId('folder-trash').first().click();
  await expect(page.getByTestId('recovery-list')).toContainText('Nota sin título');
  await page.reload();
  await expect(page.getByTestId('recovery-list')).toContainText('Nota sin título');
});

test('la búsqueda encuentra texto dentro de una forma y resalta el elemento (CA-09)', async ({
  page,
}) => {
  await freshStart(page);
  await focusCanvas(page);
  await draw(page, 'r', [300, 200], [520, 300]);
  const o = await origin(page);
  await page.mouse.dblclick(o.x + 410, o.y + 250);
  await page.keyboard.type('Hipótesis central');
  await page.keyboard.press('Escape');
  await saved(page);
  await newNote(page, 'texto con la palabra zafiro escondida');

  await page.keyboard.press('ControlOrMeta+Shift+F');
  await page.getByTestId('search-input').fill('hipotesis');
  await expect(page.getByTestId('search-hit')).toHaveCount(1);
  await expect(page.getByTestId('search-meta')).toContainText('ms');
  await page.getByTestId('search-input').press('Enter');
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect(page.getByTestId('link-element')).toBeVisible(); // la forma encontrada queda seleccionada

  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-search').click();
  await page.getByTestId('search-input').fill('zafiro');
  await page.getByTestId('search-hit').first().click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('zafiro');

  // Un documento recién creado se encuentra por su título sin necesidad de editarlo.
  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-canvas').click();
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-search').click();
  await page.getByTestId('search-input').fill('lienzo sin');
  await expect(page.getByTestId('search-hit')).toHaveCount(2);
});

test('búsqueda con el volumen de referencia en el navegador: 2 000 notas y 500 lienzos (RNF-10)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await freshStart(page);
  // Documentos e índices sintéticos escritos directamente en IndexedDB.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
    });
    const words =
      'idea mapa nodo sistema arquitectura proceso cliente datos riesgo plan objetivo equipo'.split(
        ' ',
      );
    const tx = db.transaction(['documents', 'revisions', 'searchDocuments'], 'readwrite');
    const now = new Date().toISOString();
    for (let i = 0; i < 2500; i++) {
      const canvas = i >= 2000;
      const id = crypto.randomUUID();
      const rev = crypto.randomUUID();
      const elements = canvas
        ? Array.from({ length: 100 }, (_, k) => ({
            elementId: `e${k}`,
            text: `${words[(i + k) % words.length]} ${k}`,
          }))
        : [];
      const text = canvas
        ? elements.map((e) => e.text).join(' ')
        : Array.from({ length: 150 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(' ') +
          ` único${i}`;
      tx.objectStore('documents').put({
        id,
        kind: canvas ? 'canvas' : 'note',
        title: `${canvas ? 'Lienzo' : 'Nota'} ${i}`,
        folderId: null,
        tags: [],
        deleted: false,
        headRevisionIds: [rev],
        generation: 1,
        createdAt: now,
        updatedAt: '2000-01-01T00:00:00.000Z',
      });
      tx.objectStore('revisions').put({ id: rev, documentId: id, createdAt: now });
      tx.objectStore('searchDocuments').put({
        documentId: id,
        revisionId: rev,
        kind: canvas ? 'canvas' : 'note',
        title: `${canvas ? 'Lienzo' : 'Nota'} ${i}`,
        tags: [],
        text,
        elements,
      });
    }
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  });
  const t0 = Date.now();
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
  const firstRender = Date.now() - t0;
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-search').click();
  await expect(page.getByTestId('search-indexing')).toHaveCount(0, { timeout: 120_000 });
  const ready = Date.now() - t0;
  const timings: number[] = [];
  for (const q of ['único1999', 'arquitectura', 'riesg', 'plan objetivo']) {
    await page.getByTestId('search-input').fill(q);
    const meta = page.getByTestId('search-meta');
    await expect(meta).toContainText('ms');
    timings.push(Number(/en ([\d.]+) ms/.exec((await meta.textContent())!)![1]));
  }
  console.log(
    `[RNF-10] lienzo visible: ${firstRender} ms; índice listo: ${ready} ms; consultas en el worker: ${timings.join(' / ')} ms`,
  );
  expect(Math.max(...timings)).toBeLessThan(1000);
  await page.getByTestId('search-input').fill('único1999');
  await expect(page.getByTestId('search-hit').first()).toContainText('Nota 1999');
});
