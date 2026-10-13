import { expect, test, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Fase 5: exportar el lienzo a PNG, SVG, PDF y .excalidraw (RF-33, RF-45, CA-13, CA-30),
 * importar .excalidraw y Markdown (RF-34, RF-35, CA-18) y exportar Markdown.
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

async function origin(page: Page) {
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  return { x: box.x, y: box.y };
}

async function draw(page: Page, key: string, from: [number, number], to: [number, number]) {
  const o = await origin(page);
  await page.keyboard.press(key);
  await page.mouse.move(o.x + from[0], o.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(o.x + to[0], o.y + to[1], { steps: 8 });
  await page.mouse.up();
}

async function bytesOf(download: Download): Promise<Buffer> {
  return readFile((await download.path())!);
}

async function exportAs(page: Page, format: string, setup?: () => Promise<void>) {
  await page.getByTestId('canvas-export').click();
  await page.getByTestId(`export-format-${format}`).check();
  await setup?.();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  return download;
}

test('exporta el lienzo a PNG, SVG, PDF y .excalidraw con todos los elementos (CA-13, CA-30)', async ({
  page,
}) => {
  // CA-19: exportar (fuentes del SVG incluidas) no contacta con ningún otro origen.
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== 'http://localhost:4173') {
      external.push(req.url());
    }
  });
  await freshStart(page);
  // Foco en el lienzo para que el atajo de herramienta llegue al motor.
  const start = await origin(page);
  await page.mouse.click(start.x + 120, start.y + 560);
  await draw(page, 'r', [300, 150], [500, 260]);
  const o = await origin(page);
  await page.keyboard.press('t');
  await page.mouse.click(o.x + 320, o.y + 330);
  await page.keyboard.type('Texto exportado');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

  // PNG: firma válida y exactamente el tamaño anunciado en el diálogo (escala 2×).
  let announced = '';
  const png = await exportAs(page, 'png', async () => {
    announced = (await page.getByTestId('export-size').textContent()) ?? '';
  });
  expect((await png).suggestedFilename()).toMatch(/\.png$/);
  const pngBytes = await bytesOf(await png);
  expect(pngBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = pngBytes.readUInt32BE(16);
  const height = pngBytes.readUInt32BE(20);
  expect(announced).toContain(`${width} × ${height} px`);
  expect(width).toBeGreaterThan(200);
  // La imagen se decodifica en el navegador (visor estándar) con esas dimensiones.
  const decoded = await page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    return [bitmap.width, bitmap.height];
  }, pngBytes.toString('base64'));
  expect(decoded).toEqual([width, height]);

  // SVG: XML válido con el texto y la forma.
  const svg = (await bytesOf(await exportAs(page, 'svg'))).toString('utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Texto exportado');
  const parsedOk = await page.evaluate(
    (text) => !new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror'),
    svg,
  );
  expect(parsedOk).toBe(true);

  // PDF encajado: una página; paginado con escala 3: sigue siendo un PDF completo.
  const pdf = (await bytesOf(await exportAs(page, 'pdf'))).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  const paged = await exportAs(page, 'pdf', async () => {
    await page.getByTestId('export-pdf-paginate').check();
    await page.getByTestId('export-scale').selectOption('3');
  });
  expect((await bytesOf(paged)).toString('latin1').startsWith('%PDF-')).toBe(true);

  // .excalidraw: autocontenido, con los dos elementos y el aviso de lo que no viaja.
  await page.getByTestId('canvas-export').click();
  await page.getByTestId('export-format-excalidraw').check();
  await expect(page.getByTestId('export-losses')).toContainText('Backlinks, historial');
  const ex = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const scene = JSON.parse((await bytesOf(await ex)).toString('utf8')) as {
    type: string;
    elements: Array<{ type: string; isDeleted: boolean; text?: string }>;
  };
  expect(scene.type).toBe('excalidraw');
  const live = scene.elements.filter((e) => !e.isDeleted);
  expect(live.map((e) => e.type).sort()).toEqual(['rectangle', 'text']);
  expect(live.find((e) => e.type === 'text')?.text).toBe('Texto exportado');
  expect(external).toEqual([]);
});

test('importa un .excalidraw y lista lo no soportado (CA-18)', async ({ page }) => {
  await freshStart(page);
  const dir = await mkdtemp(join(tmpdir(), 'aline-import-'));
  const file = join(dir, 'Diagrama externo.excalidraw');
  await writeFile(
    file,
    JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: [
        {
          id: 'r1',
          type: 'rectangle',
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          angle: 0,
          strokeColor: '#1e1e1e',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          seed: 1,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          groupIds: [],
          boundElements: null,
          link: null,
          locked: false,
        },
        {
          id: 'w1',
          type: 'embeddable',
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          link: 'https://www.youtube.com/watch?v=x',
        },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }),
  );
  await page.getByTestId('import-files-input').setInputFiles(file);
  await expect(page.getByTestId('import-report')).toContainText('Se creó 1 documento');
  await expect(page.getByTestId('import-problems')).toContainText('contenido web incrustado');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByTestId('active-title-text')).toContainText('Diagrama externo');
  // El lienzo importado tiene el rectángulo y nada del contenido web.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const req = indexedDB.open('mindnote-vault');
          req.onsuccess = () => resolve(req.result);
        });
        const docs = await new Promise<Array<{ title: string; headRevisionIds: string[] }>>(
          (resolve) => {
            const r = db.transaction('documents').objectStore('documents').getAll();
            r.onsuccess = () => resolve(r.result as never);
          },
        );
        const doc = docs.find((d) => d.title === 'Diagrama externo')!;
        const rev = await new Promise<{ contentRefs: { body: string } }>((resolve) => {
          const r = db
            .transaction('revisions')
            .objectStore('revisions')
            .get(doc.headRevisionIds[0]!);
          r.onsuccess = () => resolve(r.result as never);
        });
        const blob = await new Promise<{ bytes: Uint8Array }>((resolve) => {
          const r = db.transaction('blobs').objectStore('blobs').get(rev.contentRefs.body);
          r.onsuccess = () => resolve(r.result as never);
        });
        db.close();
        const scene = JSON.parse(new TextDecoder().decode(blob.bytes)) as {
          elements: Array<{ type: string }>;
        };
        return scene.elements.map((e) => e.type);
      }),
    )
    .toEqual(['rectangle']);
});

test('importa una carpeta de Markdown con subcarpetas y la vuelve a exportar (RF-35)', async ({
  page,
}) => {
  await freshStart(page);
  const root = await mkdtemp(join(tmpdir(), 'aline-md-'));
  const dir = join(root, 'Mis notas');
  await mkdir(join(dir, 'Proyectos'), { recursive: true });
  await writeFile(
    join(dir, 'Inicio.md'),
    '---\ntags: [personal]\naliases: [home]\n---\nVer [[Plan]]\n',
  );
  await writeFile(join(dir, 'Proyectos', 'Plan.md'), '# Plan\n\nTexto con ñ y tildes: áéíóú\n');
  await writeFile(join(dir, 'Proyectos', 'foto.png'), Buffer.from([0x89, 0x50]));

  await page.getByTestId('import-folder-input').setInputFiles(dir);
  await expect(page.getByTestId('import-report')).toContainText('Se crearon 2 documentos');
  await expect(page.getByTestId('import-problems')).toContainText('aliases');
  await expect(page.getByTestId('import-problems')).toContainText('foto.png');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('[data-testid="library-item"]', { hasText: 'Inicio' })).toBeVisible();
  // La subcarpeta se creó y contiene su nota.
  await expect(page.getByText('Proyectos', { exact: true }).first()).toBeVisible();

  // Exportar la nota abierta a .md: frontmatter + cuerpo.
  await page
    .locator('[data-testid="library-item"]', { hasText: 'Inicio' })
    .getByTestId('library-title-text')
    .click();
  await expect(page.locator('.cm-content')).toContainText('Ver [[Plan]]');
  const md = page.waitForEvent('download');
  await page.getByTestId('note-export').click();
  const text = (await bytesOf(await md)).toString('utf8');
  expect((await md).suggestedFilename()).toBe('Inicio.md');
  expect(text).toMatch(
    /^---\nschema_version: 1\nid: [0-9a-f-]{36}\ntitle: "Inicio"\ntags: \["personal"\]\n---\n/,
  );
  expect(text).toContain('Ver [[Plan]]');

  // Todas las notas en un ZIP con la estructura de carpetas.
  await page.locator('.library-more summary').click();
  const zip = page.waitForEvent('download');
  await page.getByTestId('export-markdown').click();
  const files = unzipSync(new Uint8Array(await bytesOf(await zip)));
  expect(Object.keys(files).sort()).toEqual(['Inicio.md', 'Proyectos/Plan.md']);
  expect(new TextDecoder().decode(files['Proyectos/Plan.md'])).toContain('áéíóú');
});
