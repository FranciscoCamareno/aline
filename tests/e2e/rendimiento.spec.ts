import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Banco de rendimiento (plan 5.6; CA-12, CA-31, RNF-01, RNF-02, RNF-17). Se ejecuta aparte con
 * `pnpm test:rendimiento` para que una máquina cargada no haga fallar la suite normal.
 * Mide en el equipo donde corre; los resultados se registran en docs/rendimiento.md con su
 * hardware. Chromium en Windows no sustituye la medición en el iPad.
 */
test.skip(
  process.env['BENCH'] !== '1' && process.env['npm_lifecycle_event'] !== 'test:rendimiento',
  'Solo con pnpm test:rendimiento (o BENCH=1)',
);
test.use({ locale: 'es-ES' });
test.setTimeout(180_000);

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

function rect(i: number) {
  const col = i % 40;
  const row = Math.floor(i / 40);
  return {
    id: `r${i}`,
    type: i % 3 === 0 ? 'ellipse' : 'rectangle',
    x: 40 + col * 70,
    y: 40 + row * 60,
    width: 50,
    height: 40,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: i % 2 ? '#a5d8ff' : 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    seed: i + 1,
    version: 1,
    versionNonce: i + 1,
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    link: null,
    locked: false,
  };
}

async function importCanvas(page: Page, title: string, count: number) {
  const dir = await mkdtemp(join(tmpdir(), 'aline-bench-'));
  const file = join(dir, `${title}.excalidraw`);
  await writeFile(
    file,
    JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: Array.from({ length: count }, (_, i) => rect(i)),
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }),
  );
  await page.getByTestId('import-files-input').setInputFiles(file);
  await page.getByRole('button', { name: 'Cerrar' }).click();
}

/** Abre un documento desde la biblioteca y mide hasta que el motor pinta la escena. */
async function timeOpen(page: Page, title: string): Promise<number> {
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  const start = Date.now();
  await page
    .locator('[data-testid="library-item"]', { hasText: title })
    .getByTestId('library-title-text')
    .click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.excalidraw canvas.static');
    if (!canvas) return false;
    // Hay escena pintada cuando el lienzo estático deja de estar en blanco.
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(
      0,
      0,
      Math.min(400, canvas.width),
      Math.min(300, canvas.height),
    );
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 200) return true;
    return false;
  });
  return Date.now() - start;
}

/** Intervalos entre fotogramas mientras se arrastra (respuesta percibida del arrastre). */
async function dragFrames(page: Page): Promise<{ p95: number; max: number; frames: number }> {
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__frames = [];
    w.__run = true;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // Coge un elemento y lo arrastra durante ~1,5 s.
  await page.mouse.move(box.x + 65, box.y + 60);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(box.x + 65 + i * 5, box.y + 60 + i * 2);
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__run = false;
    return w.__frames.slice(2);
  });
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    max: Math.round(sorted.at(-1) ?? 0),
    frames: frames.length,
  };
}

test('CA-12: lienzo de 1 000 elementos (abrir < 2 s, arrastre < 100 ms)', async ({ page }) => {
  await freshStart(page);
  await importCanvas(page, 'Mil elementos', 1000);
  const opens = [await timeOpen(page, 'Mil elementos'), await timeOpen(page, 'Mil elementos')];
  const drag = await dragFrames(page);
  console.log(
    `[CA-12] abrir: ${opens.join(' / ')} ms; arrastre: p95 ${drag.p95} ms, máx ${drag.max} ms (${drag.frames} fotogramas)`,
  );
  expect(Math.min(...opens)).toBeLessThan(2000);
  expect(drag.p95).toBeLessThan(100);
});

test('CA-31: lienzo con 100 versiones abre en < 2 s', async ({ page }) => {
  await freshStart(page);
  await importCanvas(page, 'Cien versiones', 200);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  // 99 arrastres = 99 versiones más (cada pointerup guarda una revisión).
  for (let i = 0; i < 99; i++) {
    await page.mouse.move(box.x + 65 + (i % 2) * 6, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 65 + ((i + 1) % 2) * 6, box.y + 60, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  const versions = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mindnote-vault');
      req.onsuccess = () => resolve(req.result);
    });
    const docs = await new Promise<Array<{ id: string; title: string }>>((resolve) => {
      const r = db.transaction('documents').objectStore('documents').getAll();
      r.onsuccess = () => resolve(r.result as never);
    });
    const doc = docs.find((d) => d.title === 'Cien versiones')!;
    const count = await new Promise<number>((resolve) => {
      const r = db
        .transaction('revisions')
        .objectStore('revisions')
        .index('documentId')
        .count(doc.id);
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return count;
  });
  const opens = [await timeOpen(page, 'Cien versiones'), await timeOpen(page, 'Cien versiones')];
  console.log(`[CA-31] versiones: ${versions}; abrir: ${opens.join(' / ')} ms`);
  expect(versions).toBeGreaterThanOrEqual(100);
  expect(Math.min(...opens)).toBeLessThan(2000);
});
