import { expect, test, type Page } from '@playwright/test';

/** Pomodoro con mascota en la cabecera (plan 14): modal, chip, muesca, recargas y pestañas. */
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

async function openPomodoroMenu(page: Page) {
  await page.getByTestId('open-profile').click();
  await page.getByTestId('open-pomodoro').click();
}

const chip = (page: Page) => page.getByTestId('pomodoro-chip');

test('pomodoro: configurar, empezar, pausar, recargar, terminar y descansar', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') external.push(r.url());
  });
  await page.clock.install({ time: new Date('2026-10-31T10:00:00') });
  await freshStart(page);

  // Modal: Tofu por defecto (D-14a); 2 ciclos de 25 min con 5 de descanso y 15 de descanso largo.
  await openPomodoroMenu(page);
  const dialog = page.getByTestId('pomodoro-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('pomodoro-mascot-tofu')).toBeChecked();
  await page.getByTestId('pomodoro-cycles').fill('2');
  await expect(page.getByTestId('pomodoro-total')).toContainText('Total: 1 h 10');
  await page.getByTestId('pomodoro-start').click();
  await expect(dialog).toBeHidden();

  // Chip en la cabecera y muesca al pulsarlo.
  await expect(chip(page)).toHaveAttribute('aria-label', /Enfoque, quedan (25:00|24:5\d)/);
  await chip(page).click();
  const notch = page.getByTestId('pomodoro-notch');
  await expect(notch).toContainText('Enfoque · ciclo 1 de 2');
  await page.getByTestId('pomodoro-mascot').click();
  await expect(page.getByTestId('pomodoro-bubble')).toBeVisible();

  // Pausado, el tiempo no corre, ni tras recargar.
  await page.clock.fastForward('05:00');
  await page.getByTestId('pomodoro-toggle').click();
  await expect(chip(page)).toHaveClass(/is-paused/);
  const paused = await chip(page).getAttribute('aria-label');
  await page.reload();
  await expect(chip(page)).toHaveClass(/is-paused/);
  await page.clock.fastForward('10:00');
  await expect(chip(page)).toHaveAttribute('aria-label', paused!);

  // Reanudar y llegar al final: no empieza solo el descanso (D-14b).
  await chip(page).click();
  await page.getByTestId('pomodoro-toggle').click();
  await page.clock.fastForward('21:00');
  await expect(chip(page)).toHaveClass(/is-done/);
  await expect(chip(page)).toContainText('¡Hecho!');
  await expect(page.getByTestId('pomodoro-next')).toHaveText('Empezar descanso (5 min)');
  await page.getByTestId('pomodoro-next').click();
  await expect(notch).toContainText('Descanso · ciclo 1 de 2');

  // Con un pomodoro en marcha, el menú de Perfil muestra lo que queda y abre la muesca.
  await page.keyboard.press('Escape');
  await expect(notch).toBeHidden();
  await page.getByTestId('open-profile').click();
  await expect(page.getByTestId('open-pomodoro')).toContainText(/0[45]:\d\d/);
  await page.getByTestId('open-pomodoro').click();
  await expect(notch).toBeVisible();
  await expect(page.getByTestId('pomodoro-dialog')).toBeHidden();

  // Saltar hasta el último enfoque y su descanso largo; al terminar, la sesión se cierra.
  await page.getByTestId('pomodoro-skip').click();
  await page.getByTestId('pomodoro-next').click();
  await expect(notch).toContainText('Enfoque · ciclo 2 de 2');
  await page.getByTestId('pomodoro-skip').click();
  await expect(page.getByTestId('pomodoro-next')).toHaveText('Empezar descanso (15 min)');
  await page.getByTestId('pomodoro-next').click();
  await page.getByTestId('pomodoro-skip').click();
  await expect(notch).toContainText('¡Sesión completada!');
  await expect(page.getByTestId('pomodoro-next')).toHaveCount(0);
  await page.getByTestId('pomodoro-finish').click();
  await expect(chip(page)).toHaveCount(0);

  expect(external).toEqual([]);
});

test('pomodoro: dos pestañas comparten la sesión y Detener la quita en las dos', async ({
  page,
  context,
}) => {
  await freshStart(page);
  await openPomodoroMenu(page);
  // La tarjeta entera es la etiqueta del radio.
  await page.locator('.pomodoro-mascot-option', { hasText: 'Pico' }).click();
  await expect(page.getByTestId('pomodoro-mascot-pico')).toBeChecked();
  await page.getByTestId('pomodoro-focus-50').click();
  await page.getByTestId('pomodoro-start').click();
  await expect(chip(page)).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('mindnote.pomodoro'));
  expect(JSON.parse(stored!).config).toMatchObject({ mascot: 'pico', focusMinutes: 50 });

  const other = await context.newPage();
  await other.goto('/');
  await expect(chip(other)).toHaveAttribute('aria-label', /Enfoque, quedan (50:00|49:\d\d)/);

  // La otra pestaña pausa: la primera lo ve.
  await chip(other).click();
  await other.getByTestId('pomodoro-toggle').click();
  await expect(chip(page)).toHaveClass(/is-paused/);

  await other.getByTestId('pomodoro-stop').click();
  await expect(chip(other)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
});

test('pomodoro: en modo Zen el chip flota sin cabecera', async ({ page }) => {
  await freshStart(page);
  await openPomodoroMenu(page);
  await page.getByTestId('pomodoro-start').click();
  await expect(page.locator('.topbar').getByTestId('pomodoro-chip')).toBeVisible();

  await page.locator('.excalidraw .interactive').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('Alt+z');
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.locator('.pomo-anchor.is-floating').getByTestId('pomodoro-chip')).toBeVisible();
});
