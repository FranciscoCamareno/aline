import { expect, test, type Page } from '@playwright/test';

/**
 * Calendario (DESIGN.md §8) y plantillas del lienzo: contenido nuevo del almacén (cambio de
 * arquitectura del 14/10/2026). Cada cambio es una revisión y sobrevive a recargar.
 */
test.use({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });

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
  await expect(page.getByTestId('tool-tray')).toBeVisible();
}

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test('calendario: crear, editar, ocultar y borrar eventos, y que se guarden', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await expect(page.getByTestId('calendar-view')).toBeVisible();
  // El primer calendario se crea solo.
  await expect(page.getByTestId('calendar-item')).toHaveText(['Personal']);
  // La cabecera no ofrece acciones de documento.
  await expect(page.getByTestId('open-history')).toHaveCount(0);

  // Evento de todo el día, hoy.
  await page.getByTestId('new-event').click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo evento' });
  await expect(page.getByTestId('event-title')).toBeFocused();
  await page.getByTestId('event-title').fill('Entrega portada');
  await page.getByTestId('event-all-day').check();
  await page.getByRole('radio', { name: 'Rosa' }).check();
  await page.getByTestId('event-save').click();
  await expect(dialog).toBeHidden();
  const chip = page.getByTestId('event-chip').filter({ hasText: 'Entrega portada' });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/event-rosa/);
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

  // Evento con hora: aparece como bloque en la vista de semana.
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-title').fill('Escena de lluvia');
  await page.getByTestId('event-all-day').uncheck();
  await page.getByTestId('event-start').fill('09:00');
  await page.getByTestId('event-end').fill('10:30');
  await page.getByTestId('event-save').click();
  await expect(
    page.getByTestId('event-chip').filter({ hasText: '09:00 Escena de lluvia' }),
  ).toBeVisible();
  await page.getByTestId('calendar-view-week').click();
  await expect(
    page.getByTestId('event-block').filter({ hasText: 'Escena de lluvia' }),
  ).toContainText('09:00 – 10:30');

  // Un fin anterior al inicio no se guarda.
  await page.getByTestId('event-block').filter({ hasText: 'Escena de lluvia' }).click();
  await page.getByTestId('event-end').fill('08:00');
  await page.getByTestId('event-save').click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'anterior a la de inicio' }),
  ).toBeVisible();
  await page.getByTestId('event-end').fill('11:00');
  await page.getByTestId('event-save').click();
  await expect(
    page.getByTestId('event-block').filter({ hasText: 'Escena de lluvia' }),
  ).toContainText('09:00 – 11:00');

  // Persistencia.
  await page.reload();
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await expect(page.getByTestId('event-chip').filter({ hasText: 'Entrega portada' })).toBeVisible();

  // Ocultar el calendario oculta sus eventos (y se recuerda en este navegador).
  await page.getByRole('checkbox', { name: 'Mostrar Personal' }).uncheck();
  await expect(page.getByTestId('event-chip')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mostrar Personal' }).check();

  // Borrar.
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('event-chip').filter({ hasText: 'Entrega portada' }).click();
  await page.getByTestId('event-delete').click();
  await expect(page.getByTestId('event-chip').filter({ hasText: 'Entrega portada' })).toHaveCount(
    0,
  );

  // Un segundo calendario y mover un evento a él.
  await page.getByTestId('new-calendar').click();
  await page.getByTestId('new-calendar-input').fill('Proyectos');
  await page.getByTestId('new-calendar-input').press('Enter');
  await expect(page.getByTestId('calendar-item')).toHaveText(['Personal', 'Proyectos']);
  await page.getByTestId('event-chip').filter({ hasText: 'Escena de lluvia' }).click();
  await page.getByTestId('event-calendar').selectOption({ label: 'Proyectos' });
  await page.getByTestId('event-save').click();
  await page.getByRole('checkbox', { name: 'Mostrar Personal' }).uncheck();
  await expect(
    page.getByTestId('event-chip').filter({ hasText: 'Escena de lluvia' }),
  ).toBeVisible();

  // Volver a la biblioteca: los calendarios no aparecen entre lienzos y notas.
  await page.getByRole('tab', { name: 'Notas' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  expect(today()).toMatch(/^\d{4}-/);
});

test('plantillas: guardar la selección con un sticker, insertarla y que se guarde', async ({
  page,
}) => {
  await freshStart(page);
  // El botón «Biblioteca» del motor ya no se muestra.
  await expect(page.locator('.excalidraw .default-sidebar-trigger')).toBeHidden();

  // Un sticker (imagen) en el lienzo.
  await page.getByTestId('tool-sticker').click();
  await page.getByTestId('sticker-corazon').click();
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');

  await page.getByTestId('open-templates').click();
  const panel = page.getByTestId('templates-panel');
  await expect(panel.getByTestId('template-save')).toBeEnabled();
  await panel.getByTestId('template-save').click();
  await panel.getByTestId('template-name').fill('Corazón');
  await panel.getByTestId('template-name').press('Enter');
  const item = panel.getByTestId('template-item').filter({ hasText: 'Corazón' });
  await expect(item).toBeVisible();

  // Insertar: una copia nueva (con su imagen) en el centro.
  await item.getByTestId('template-title-text').click();
  await expect(page.getByTestId('save-status')).toHaveText('Guardado en este dispositivo');
  const imagesInScene = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('mindnote-vault');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const all = <T>(store: string) =>
        new Promise<T[]>((resolve) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => resolve(r.result as T[]);
        });
      try {
        const docs = await all<{ id: string; kind: string; headRevisionIds: string[] }>(
          'documents',
        );
        const canvas = docs.find((d) => d.kind === 'canvas')!;
        const revs = await all<{ id: string; contentRefs: { body: string } }>('revisions');
        const head = revs.find((r) => r.id === canvas.headRevisionIds[0])!;
        const blobs = await all<{ hash: string; bytes: Uint8Array }>('blobs');
        const body = blobs.find((b) => b.hash === head.contentRefs.body)!;
        const scene = JSON.parse(new TextDecoder().decode(body.bytes)) as {
          elements: Array<{ type: string; isDeleted: boolean }>;
        };
        return scene.elements.filter((e) => e.type === 'image' && !e.isDeleted).length;
      } finally {
        db.close();
      }
    });
  await expect.poll(imagesInScene).toBe(2);

  // La plantilla es un documento del almacén: sigue tras recargar y no sale en la biblioteca.
  await page.reload();
  await page.getByTestId('open-templates').click();
  await expect(page.getByTestId('template-item').filter({ hasText: 'Corazón' })).toBeVisible();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
});

test('vista de día: un solo día con sus horas, y navegar de día en día', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-title').fill('Lectura de guion');
  await page.getByTestId('event-all-day').uncheck();
  await page.getByTestId('event-start').fill('16:00');
  await page.getByTestId('event-end').fill('17:00');
  await page.getByTestId('event-save').click();

  await page.getByTestId('calendar-view-day').click();
  const day = page.getByTestId('day-view');
  await expect(day).toBeVisible();
  await expect(day.locator('.week-column')).toHaveCount(1);
  await expect(day.getByTestId('event-block')).toContainText('Lectura de guion');
  await expect(page.getByTestId('calendar-view-day')).toHaveAttribute('aria-pressed', 'true');

  // Siguiente día: ya no está el evento; «Hoy» vuelve.
  await page.getByTestId('calendar-next').click();
  await expect(day.getByTestId('event-block')).toHaveCount(0);
  await page.getByTestId('calendar-today').click();
  await expect(day.getByTestId('event-block')).toHaveCount(1);
});

test('mes: el marco del día seleccionado coincide con su celda, en todas las filas', async ({
  page,
}) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  const cells = page.locator('.month-day');
  await expect(cells).toHaveCount(42);
  for (const index of [0, 10, 17, 24, 41]) {
    // Pulsar un día de otro mes cambia de mes: se mira siempre la celda seleccionada.
    await cells.nth(index).locator('.day-number').click();
    const cell = page.locator('.month-day.selected');
    await expect(cell).toHaveCount(1);
    const box = await cell.boundingBox();
    const frame = await cell.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      return {
        content: after.content,
        width: parseFloat(after.width),
        height: parseFloat(after.height),
        cellW: r.width,
        cellH: r.height,
      };
    });
    expect(frame.content).not.toBe('none');
    // El marco ocupa la celda (menos 1 px por lado), ni más ni menos.
    expect(Math.abs(frame.width - (frame.cellW - 2))).toBeLessThan(1.5);
    expect(Math.abs(frame.height - (frame.cellH - 2))).toBeLessThan(1.5);
    // Y la celda cabe en su semana: nada se sale de su fila.
    const week = await cell.evaluate((el) => {
      const row = el.parentElement!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { overflow: Math.max(0, r.bottom - row.bottom, row.top - r.top) };
    });
    expect(week.overflow).toBeLessThan(1);
    expect(box).not.toBeNull();
  }
});

test('mes: toda la casilla selecciona el día, no solo su número', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  const cell = page.locator('.month-day[data-date]').nth(17);
  const date = await cell.getAttribute('data-date');
  const box = (await cell.boundingBox())!;
  // Un punto de la casilla lejos del número (abajo a la derecha), sin eventos encima.
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
  await expect(page.locator('.month-day.selected')).toHaveAttribute('data-date', date!);
});

for (const language of ['es', 'en']) {
  test(`los botones del mes no se mueven al cambiar de mes (${language})`, async ({ page }) => {
    await page.addInitScript((lang) => localStorage.setItem('mindnote.language', lang), language);
    await freshStart(page);
    await page.getByRole('tab', { name: language === 'es' ? 'Calendario' : 'Calendar' }).click();
    const buttons = [
      page.getByTestId('calendar-prev'),
      page.getByTestId('calendar-next'),
      page.getByTestId('calendar-today'),
    ];
    const positions = async () => Promise.all(buttons.map((b) => b.boundingBox()));
    const first = await positions();
    // Un año entero: los nombres más largos y más cortos pasan por la cabecera.
    for (let month = 0; month < 12; month++) {
      await page.getByTestId('calendar-next').click();
      // El nombre cabe entero en su ancho fijo (si no, taparía los botones).
      const fits = await page
        .locator('.calendar-title')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(fits).toBe(true);
      const now = await positions();
      now.forEach((box, i) => {
        expect(Math.abs(box!.x - first[i]!.x)).toBeLessThan(1);
        expect(Math.abs(box!.y - first[i]!.y)).toBeLessThan(1);
      });
    }
  });
}

test('editar evento: «Empieza» y «Termina» van en la misma línea', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('tab', { name: 'Calendario' }).click();
  await page.getByTestId('new-event').click();
  await page.getByTestId('event-all-day').check();
  const sameLine = async () => {
    const start = (await page.getByTestId('event-date').boundingBox())!;
    const end = (await page.getByTestId('event-end-date').boundingBox())!;
    expect(Math.abs(start.y - end.y)).toBeLessThan(1);
    expect(end.x).toBeGreaterThan(start.x + start.width - 1);
  };
  await sameLine();
  // Con hora, las horas van bajo sus fechas y las dos columnas siguen en la misma línea.
  await page.getByTestId('event-all-day').uncheck();
  await sameLine();
  const startTime = (await page.getByTestId('event-start').boundingBox())!;
  const endTime = (await page.getByTestId('event-end').boundingBox())!;
  expect(Math.abs(startTime.y - endTime.y)).toBeLessThan(1);
});
