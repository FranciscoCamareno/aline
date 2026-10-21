import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * CSP obligatoria (plan 9.1, diseño §13): la vista previa local no aplica `public/_headers`,
 * así que esta prueba sirve la aplicación con la política declarada allí y recorre lienzo (con texto en chino, que carga las fuentes Xiaolai
 * del motor), nota, documento con formato y búsqueda (worker): no debe haber ni una violación.
 * La parte de Google (GIS y la API de Drive) solo se puede comprobar con Google real.
 */
test.use({ locale: 'es-ES', serviceWorkers: 'block' });

/** La política obligatoria de `public/_headers`, tal cual. */
function deployedPolicy(): string {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const line = headers
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('Content-Security-Policy:'));
  if (!line) throw new Error('public/_headers no declara la CSP');
  return line.slice('Content-Security-Policy:'.length).trim();
}

async function serveWithCsp(page: Page, baseURL: string) {
  const policy = deployedPolicy();
  const origin = new URL(baseURL).origin;
  await page.route(
    (url) => url.origin === origin,
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': policy },
      });
    },
  );
}

test('con la CSP del despliegue obligatoria, la aplicación no la incumple (plan 9.1)', async ({
  page,
  baseURL,
}) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(
        `Content Security Policy: ${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`,
      );
    });
  });
  await serveWithCsp(page, baseURL!);

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('mindnote.welcome', '1'));
  await page.reload();
  await expect(page.locator('.excalidraw')).toBeVisible();

  // Texto en el lienzo con caracteres chinos: el motor carga sus fuentes Xiaolai.
  const box = (await page.locator('.excalidraw canvas.interactive').boundingBox())!;
  await page.mouse.click(box.x + 420, box.y + 260);
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 420, box.y + 260);
  await page.keyboard.type('你好 aline');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('save-status')).toContainText('Guardado', { timeout: 10_000 });

  await page.getByTestId('new-menu').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Nota con la palabra zafiro');
  await expect(page.getByTestId('save-status')).toContainText('Guardado', { timeout: 10_000 });

  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByTestId('new-menu').click();
  await page.getByRole('menuitem', { name: 'Documento con formato' }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Shift+F');
  await page.getByTestId('search-input').fill('zafiro');
  await expect(page.getByTestId('search-hit')).toHaveCount(1);

  await page.waitForLoadState('networkidle');
  expect(violations).toEqual([]);
});
