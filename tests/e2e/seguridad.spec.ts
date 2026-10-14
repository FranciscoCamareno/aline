import { expect, test, type Page } from '@playwright/test';

/**
 * Regresión de la auditoría de seguridad del 13/10/2026, H02: una escena que llega por
 * sincronización (aquí, escrita por «otro equipo» en la carpeta conectada) no puede hacer
 * peticiones externas al abrirse ni ejecutar HTML incrustado. La carpeta es OPFS, como en fase4.
 */
test.use({ locale: 'es-ES' });

const FOLDER = 'carpeta-seguridad';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((name) => {
    (
      window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  }, FOLDER);
});

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async (name) => {
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
    await (
      await navigator.storage.getDirectory()
    )
      .removeEntry(name, { recursive: true })
      .catch(() => undefined);
  }, FOLDER);
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();
}

test('una escena sincronizada con imagen remota e iframe con HTML no contacta con nadie (H02)', async ({
  page,
}) => {
  const external: string[] = [];
  await page.route('https://audit.invalid/**', (route) => {
    external.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await freshStart(page);
  await page.getByTestId('more-menu').click();
  await page.getByTestId('open-status').click();
  await page.getByTestId('connect-folder').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('al día');

  // «Otro equipo» publica en la carpeta una versión nueva del lienzo inicial.
  const canvasId = await page.evaluate(async (name) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    const revisions = await root.getDirectoryHandle('revisions');
    const objects = await root.getDirectoryHandle('objects');
    let previous: {
      id: string;
      documentId: string;
      metadata: { kind: string };
      contentRefs: { body: string | null; extensions: string | null; assets: string[] };
    } | null = null;
    for await (const handle of (
      revisions as unknown as { values(): AsyncIterable<FileSystemFileHandle> }
    ).values()) {
      const rev = JSON.parse(await (await handle.getFile()).text());
      if (rev.metadata.kind === 'canvas') previous = rev;
    }
    if (!previous) throw new Error('sin lienzo en la carpeta');
    const base = {
      x: 10,
      y: 10,
      width: 200,
      height: 150,
      angle: 0,
      strokeColor: '#000000',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: 1,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    };
    const scene = {
      type: 'excalidraw',
      version: 2,
      source: 'auditoria',
      elements: [
        {
          ...base,
          id: 'imagen-remota',
          type: 'image',
          index: 'a0',
          status: 'saved',
          fileId: 'archivo-remoto',
          scale: [1, 1],
          crop: null,
        },
        {
          ...base,
          id: 'marco-html',
          type: 'iframe',
          index: 'a1',
          x: 300,
          customData: {
            generationData: {
              status: 'done',
              html: '<img src="https://audit.invalid/desde-iframe"><script>fetch("https://audit.invalid/script")</script>',
            },
          },
        },
        {
          ...base,
          id: 'incrustado',
          type: 'embeddable',
          index: 'a2',
          y: 300,
          link: 'https://audit.invalid/embed',
        },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {
        'archivo-remoto': {
          id: 'archivo-remoto',
          mimeType: 'image/png',
          dataURL: 'https://audit.invalid/pixel',
          created: 1,
        },
      },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(scene));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const write = async (
      dir: FileSystemDirectoryHandle,
      file: string,
      data: Uint8Array | string,
    ) => {
      const writable = await (await dir.getFileHandle(file, { create: true })).createWritable();
      await writable.write(data as FileSystemWriteChunkType);
      await writable.close();
    };
    await write(objects, `${hash}.excalidraw`, bytes);
    const id = crypto.randomUUID();
    const revision = {
      ...previous,
      id,
      parentIds: [previous.id],
      deviceId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      operation: 'save',
      contentRefs: { ...previous.contentRefs, body: hash },
    };
    await write(revisions, `${id}.json`, JSON.stringify(revision));
    return previous.documentId;
  }, FOLDER);

  await page.getByTestId('folder-sync').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('al día');
  await page.keyboard.press('Escape');
  await page
    .locator(`[data-testid="library-item"][data-document-id="${canvasId}"]`)
    .getByTestId('library-title-text')
    .click();
  await expect(page.locator('.excalidraw')).toBeVisible();
  // El elemento iframe llegó (la escena no se descartó), pero sin el HTML de la escena.
  const frames = page.locator('iframe.excalidraw__embeddable');
  await expect(frames).toHaveCount(1);
  await page.waitForTimeout(2_000);
  expect(external).toEqual([]);
  const srcdocs = await frames.evaluateAll((frames) =>
    frames.map((f) => (f as HTMLIFrameElement).srcdoc),
  );
  for (const html of srcdocs) expect(html).not.toContain('audit.invalid');
});
