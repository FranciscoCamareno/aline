import { expect, test, type Page } from '@playwright/test';
import { FakeDrive } from '../unit/fakeDrive.ts';

/**
 * Fase 4 con Drive (plan 4.4, 4.5): aviso RN-12, carga diferida de Google y recorrido completo
 * contra una SIMULACIÓN de Google (GIS falso en la página y Drive API servida por FakeDrive).
 * No prueba la ventana real de Google, la cuenta ni el Drive real: eso queda para el propietario.
 */
test.use({ locale: 'es-ES' });

const isGoogle = (url: string) => /^https:\/\/([a-z0-9-]+\.)*(google|googleapis)\.com\//.test(url);

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

/** GIS falso: concede el token sin ventana (la ventana real no es automatizable). */
async function fakeGis(page: Page, token: string) {
  await page.addInitScript((accessToken) => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient(config: { callback: (r: unknown) => void }) {
            const client = {
              callback: config.callback,
              requestAccessToken() {
                setTimeout(() =>
                  client.callback({
                    access_token: accessToken,
                    expires_in: 3599,
                    scope: 'https://www.googleapis.com/auth/drive.file',
                  }),
                );
              },
            };
            return client;
          },
          revoke(_token: string, done?: () => void) {
            done?.();
          },
          hasGrantedAllScopes: () => true,
        },
      },
    };
  }, token);
}

/** Sirve www.googleapis.com desde FakeDrive (con CORS, como la API real). */
async function routeDrive(page: Page, drive: FakeDrive) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
    'Access-Control-Expose-Headers': 'Location, Retry-After',
  };
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = request.postDataBuffer();
    const response = await drive.fetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
    const headers: Record<string, string> = { ...cors };
    response.headers.forEach((value, key) => (headers[key] = value));
    await route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

async function newNote(page: Page, text: string): Promise<string> {
  await page.getByTestId('new-note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  const id = await page
    .locator('[data-testid="library-item"].active')
    .getAttribute('data-document-id');
  return id!;
}

test('el aviso RN-12 aparece antes de todo y cancelarlo no contacta con Google (CA-27)', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (isGoogle(req.url())) external.push(req.url());
  });
  // Ninguna petición a Google llega a la red durante la prueba.
  await page.route(
    (url) => isGoogle(url.toString()),
    (route) => route.abort(),
  );
  await freshStart(page);
  await page.getByTestId('open-status').click();
  await page.getByTestId('connect-drive').click();
  // Elegir modo es obligatorio: ninguna opción viene marcada y se explican ambas.
  await expect(page.getByTestId('drive-warning')).toContainText('Google y quien tenga acceso');
  await expect(page.getByTestId('drive-warning')).toContainText('no se puede recuperar');
  await expect(page.getByTestId('drive-accept')).toBeDisabled();
  await page.getByTestId('drive-cancel').click();
  await expect(page.getByTestId('drive-warning')).toBeHidden();
  await page.waitForTimeout(300);
  expect(external).toEqual([]);

  // Aceptar carga SOLO la librería de Google; sin token no se llama a la API de Drive.
  await page.getByTestId('connect-drive').click();
  await page.getByTestId('drive-mode-plain').check();
  await page.getByTestId('drive-accept').click();
  await expect.poll(() => external).toContain('https://accounts.google.com/gsi/client');
  expect(external.filter((u) => u.includes('googleapis.com'))).toEqual([]);
});

test('conectar Drive, sincronizar y abrir el almacén desde otro «equipo» (plan 4.5, simulado)', async ({
  page,
}) => {
  const drive = new FakeDrive();
  await fakeGis(page, drive.token);
  await routeDrive(page, drive);
  await freshStart(page);
  const noteId = await newNote(page, 'escrito en el equipo A');

  await page.getByTestId('open-status').click();
  await page.getByTestId('connect-drive').click();
  await page.getByTestId('drive-mode-plain').check();
  await page.getByTestId('drive-accept').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('sincronizado');
  await expect(page.getByTestId('remote-status')).toContainText('Sincronizado ·');
  expect(drive.byProperty('mindnote', 'vault')).toHaveLength(1);
  expect(drive.byProperty('documentId', noteId).length).toBeGreaterThan(0);

  // Tras recargar, el token (solo en memoria) ya no existe: hay que autorizar con un gesto.
  await page.reload();
  await expect(page.getByTestId('remote-status')).toContainText('Necesita autorización');

  // «Otro equipo»: almacén nuevo; Drive tiene otro almacén y se ofrece abrirlo aquí.
  await page.getByTestId('open-status').click();
  await page.getByPlaceholder('Nombre del almacén nuevo').fill('Equipo B');
  await page.getByRole('button', { name: 'Crear y abrir' }).click();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.getByTestId('open-status').click();
  await page.getByTestId('connect-drive').click();
  await page.getByTestId('drive-mode-plain').check();
  await page.getByTestId('drive-accept').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('drive-choices')).toContainText('Mi almacén');
  await page
    .getByTestId('drive-choices')
    .getByRole('button', { name: 'Abrir ese almacén aquí' })
    .click();
  await expect(page.getByTestId('remote-status')).toContainText('Necesita autorización');
  await page.getByTestId('remote-status').click();
  await page.getByTestId('drive-reconnect').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('sincronizado');
  const item = page.locator(`[data-testid="library-item"][data-document-id="${noteId}"]`);
  await expect(item).toBeVisible();
  await item.getByTestId('library-title-text').click();
  await expect(page.locator('.cm-content')).toContainText('escrito en el equipo A');
  // Abrir el almacén de Drive no añade el lienzo de bienvenida al almacén compartido.
  await expect(page.getByTestId('library-item')).toHaveCount(2);
});

test('Drive cifrado: contraseña, código de recuperación, otro equipo y cambio de modo (§13.1, simulado)', async ({
  page,
}) => {
  const drive = new FakeDrive();
  const allText = () =>
    [...drive.files.values()]
      .filter((f) => !f.trashed)
      .map(
        (f) => `${f.name} ${JSON.stringify(f.appProperties)} ${new TextDecoder().decode(f.bytes)}`,
      )
      .join('\n');
  await fakeGis(page, drive.token);
  await routeDrive(page, drive);
  await freshStart(page);
  const noteId = await newNote(page, 'nota confidencial del equipo A');

  // Equipo A: elige cifrar, crea la contraseña y guarda el código de recuperación.
  await page.getByTestId('open-status').click();
  await page.getByTestId('connect-drive').click();
  await page.getByTestId('drive-mode-encrypted').check();
  await page.getByTestId('drive-password').fill('una contraseña larga');
  await page.getByTestId('drive-password-confirm').fill('otra distinta');
  await expect(page.getByTestId('drive-accept')).toBeDisabled();
  await page.getByTestId('drive-password-confirm').fill('una contraseña larga');
  await page.getByTestId('drive-accept').click();
  const code = (await page.getByTestId('drive-recovery-code').textContent())!.trim();
  expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  await expect(page.getByTestId('drive-recovery-done')).toBeDisabled();
  await page.getByTestId('drive-recovery-saved').check();
  await page.getByTestId('drive-recovery-done').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('sincronizado', { timeout: 20_000 });
  await expect(page.getByTestId('drive-encryption-mode')).toContainText('Cifrado');
  expect(allText()).not.toContain('nota confidencial');
  expect(allText()).not.toContain(noteId);
  expect(drive.byProperty('mindnote', 'vault')[0]?.name).toBe('Aline - Mi almacén (cifrado)');

  // Tras recargar solo hace falta autorizar Google: la clave quedó guardada en este equipo.
  await page.reload();
  await page.getByTestId('remote-status').click();
  await page.getByTestId('drive-reconnect').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('sincronizado');

  // Equipo B: abre el almacén cifrado; una contraseña errónea no sirve, el código sí.
  await page.getByPlaceholder('Nombre del almacén nuevo').fill('Equipo B');
  await page.getByRole('button', { name: 'Crear y abrir' }).click();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.getByTestId('open-status').click();
  await page.getByTestId('connect-drive').click();
  await page.getByTestId('drive-mode-plain').check();
  await page.getByTestId('drive-accept').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('drive-choices')).toContainText('Mi almacén · cifrado');
  await page
    .getByTestId('drive-choices')
    .getByRole('button', { name: 'Abrir ese almacén aquí' })
    .click();
  await page.getByTestId('remote-status').click();
  await page.getByTestId('drive-reconnect').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('remote-status')).toContainText('Necesita contraseña');
  await page.getByTestId('drive-unlock-secret').fill('contraseña equivocada');
  await page.getByTestId('drive-unlock-submit').click();
  await expect(page.getByTestId('drive-unlock')).toContainText('no son correctos');
  await page.getByTestId('drive-unlock-secret').fill(code.toLowerCase());
  await page.getByTestId('drive-unlock-submit').click();
  await expect(page.getByTestId('storage-phase')).toHaveText('sincronizado');
  const item = page.locator(`[data-testid="library-item"][data-document-id="${noteId}"]`);
  await item.getByTestId('library-title-text').click();
  await expect(page.locator('.cm-content')).toContainText('nota confidencial del equipo A');

  // B quita el cifrado desde la configuración: carpeta nueva sin cifrar, la antigua a la papelera.
  await page.getByTestId('remote-status').click();
  await page.getByTestId('drive-settings').locator('summary').click();
  await page.getByTestId('drive-switch-mode').click();
  await expect(page.getByTestId('drive-warning')).toContainText('Google podrá leer');
  await page.getByTestId('drive-accept').click();
  await expect(page.getByTestId('drive-previous')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('drive-encryption-mode')).toContainText('Sin cifrar');
  await page.getByTestId('drive-trash-previous').click();
  await expect(page.getByTestId('drive-previous')).toBeHidden();
  expect(allText()).toContain('nota confidencial del equipo A'); // copia legible en Drive
  expect(drive.byProperty('mindnote', 'vault').filter((f) => !f.trashed)).toHaveLength(1);

  // A vuelve: su carpeta cifrada ya no existe y pasa sola a la nueva, sin cifrar.
  await page
    .getByTestId('vault-item')
    .filter({ hasText: 'Mi almacén' })
    .first()
    .getByRole('button', { name: 'Abrir' })
    .click();
  await page.getByTestId('remote-status').click();
  await page.getByTestId('drive-reconnect').click();
  await page.getByTestId('drive-authorize').click();
  await expect(page.getByTestId('drive-encryption-mode')).toContainText('Sin cifrar');
  await expect(page.getByTestId('storage-phase')).toHaveText('sincronizado');
});
