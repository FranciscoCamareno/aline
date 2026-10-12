import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Declara window.fase0 (API del banco).
import type {} from '../../spikes/fase0/fase0-api.ts';

/**
 * Fase 0 — viabilidad del motor (diseño §17, plan §3). Cada prueba registra observaciones en
 * spikes/fase0/results/<navegador>.json. Chromium automatizado NO certifica el iPad ni el
 * Apple Pencil: la prueba 0.4 aquí solo es indicativa.
 */
test.describe.configure({ mode: 'serial' });

const results: Record<string, unknown> = {};
const record = (key: string, value: unknown) => {
  results[key] = value;
  console.log(`[fase0] ${key}: ${JSON.stringify(value)}`);
};

test.afterAll(async ({ browserName }) => {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'spikes',
    'fase0',
    'results',
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${browserName}.json`),
    JSON.stringify({ fecha: new Date().toISOString(), ...results }, null, 2),
  );
});

async function openHarness(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.fase0?.api !== null && window.fase0?.api !== undefined);
}

/** Coordenadas de pantalla de un punto de la escena. */
async function toViewport(page: Page, sceneX: number, sceneY: number) {
  return page.evaluate(
    ([x, y]) => {
      const { api, lib } = window.fase0;
      const v = lib.sceneCoordsToViewportCoords({ sceneX: x!, sceneY: y! }, api!.getAppState());
      return { x: v.x, y: v.y };
    },
    [sceneX, sceneY],
  );
}

async function elementById(page: Page, id: string) {
  return page.evaluate(
    (elId) =>
      window.fase0.api!.getSceneElementsIncludingDeleted().find((e) => e.id === elId) ?? null,
    id,
  );
}

/** Escena de referencia de 1 000 elementos generada por el banco. */
const mountThousand = (page: Page) => page.evaluate(() => window.fase0.mountThousand());

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

test('0.1 apertura y arrastre con 1 000 elementos', async ({ page }) => {
  await openHarness(page);
  const cdp = await page.context().newCDPSession(page);
  const report: Record<string, unknown> = {};

  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const mounts: number[] = [];
    let count = 0;
    for (let i = 0; i < 5; i++) {
      const r = await mountThousand(page);
      mounts.push(r.mountMs);
      count = r.count;
    }

    // Ruta completa del producto: serializar (guardar) y deserializar + montar (reabrir).
    const pipeline = await page.evaluate(async () => {
      const { api, codec } = window.fase0;
      const scene = {
        elements: api!.getSceneElements(),
        appState: api!.getAppState(),
        files: api!.getFiles(),
      };
      const t0 = performance.now();
      const saved = await codec.serialize(scene);
      const t1 = performance.now();
      const reopened = await codec.deserialize(saved.sceneJson, async () => undefined);
      const t2 = performance.now();
      const mountMs = await window.fase0.mount(reopened.elements);
      return {
        bytes: saved.sceneJson.length,
        serializeMs: t1 - t0,
        deserializeMs: t2 - t1,
        reopenTotalMs: t2 - t1 + mountMs,
        elementsAfterReopen: reopened.elements.length,
      };
    });

    // Arrastre de un nodo, midiendo la duración de los eventos (Event Timing API).
    await page.evaluate(() => {
      const w = window as unknown as { __events: number[]; __moves: number; __frames: number[] };
      w.__events = [];
      w.__moves = 0;
      w.__frames = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === 'pointermove' || e.name === 'pointerdown' || e.name === 'pointerup') {
            w.__events.push(e.duration);
          }
        }
      }).observe({
        type: 'event',
        durationThreshold: 16,
        buffered: false,
      } as PerformanceObserverInit);
      window.addEventListener('pointermove', () => w.__moves++, true);
      let last = performance.now();
      const tick = (t: number) => {
        w.__frames.push(t - last);
        last = t;
        if (w.__frames.length < 100000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.evaluate(() => {
      const { api } = window.fase0;
      const el = api!.getSceneElements().find((e) => e.id === 'n45')!;
      api!.scrollToContent(el, { animate: false });
    });
    const before = (await elementById(page, 'n45'))!;
    const c = await toViewport(page, before.x + 20, before.y + 20);
    await page.evaluate(() => ((window as unknown as { __frames: number[] }).__frames = []));
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 300, c.y + 150, { steps: 60 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = (await elementById(page, 'n45'))!;
    const drag = await page.evaluate(() => {
      const w = window as unknown as { __events: number[]; __moves: number; __frames: number[] };
      const frames = [...w.__frames].sort((a, b) => a - b);
      return {
        pointermoveEvents: w.__moves,
        eventsOver16ms: w.__events.length,
        maxEventMs: w.__events.length ? Math.max(...w.__events) : 0,
        frameP95Ms: frames[Math.floor(frames.length * 0.95)] ?? null,
      };
    });
    report[`cpu_x${rate}`] = {
      elements: count,
      mountMedianMs: Math.round(median(mounts)),
      mountsMs: mounts.map(Math.round),
      pipeline: {
        ...pipeline,
        serializeMs: Math.round(pipeline.serializeMs),
        deserializeMs: Math.round(pipeline.deserializeMs),
        reopenTotalMs: Math.round(pipeline.reopenTotalMs),
      },
      drag: { ...drag, moved: after.x !== before.x },
    };
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  record('0.1_rendimiento', report);
  const x1 = report['cpu_x1'] as { elements: number; drag: { moved: boolean } };
  expect(x1.elements).toBe(1000);
  expect(x1.drag.moved).toBe(true);
});

async function mountSmall(page: Page, extra: unknown[] = []) {
  await page.evaluate(async (more) => {
    const { lib } = window.fase0;
    const elements = lib.convertToExcalidrawElements(
      [
        {
          type: 'rectangle',
          id: 'A',
          x: 100,
          y: 150,
          width: 160,
          height: 80,
          label: { text: 'Nodo A' },
        },
        {
          type: 'rectangle',
          id: 'B',
          x: 450,
          y: 150,
          width: 160,
          height: 80,
          label: { text: 'Nodo B' },
        },
        ...(more as []),
      ] as Parameters<typeof lib.convertToExcalidrawElements>[0],
      { regenerateIds: false },
    );
    await window.fase0.mount(elements);
  }, extra);
}

const DOC = 'mindnote://document/8b53f815-9d38-4313-a1ad-cb690fabf23c';

test('0.2 enlace interno mindnote:// en un elemento', async ({ page, context }) => {
  await openHarness(page);
  await mountSmall(page);
  const out: Record<string, unknown> = {};

  // a) Asignado por API.
  out['viaApi'] = await page.evaluate((link) => {
    const { api, lib } = window.fase0;
    api!.updateScene({
      elements: api!
        .getSceneElements()
        .map((e) => (e.id === 'A' ? lib.newElementWith(e, { link }) : e)),
      captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
    });
    return api!.getSceneElements().find((e) => e.id === 'A')!.link;
  }, DOC);

  // b) Ida y vuelta por serializeAsJSON/restore y por el códec del producto.
  out['roundTrip'] = await page.evaluate(async () => {
    const { api, lib, codec } = window.fase0;
    const json = lib.serializeAsJSON(
      api!.getSceneElements(),
      api!.getAppState(),
      api!.getFiles(),
      'local',
    );
    const restored = lib.restore(JSON.parse(json), null, null);
    const saved = await codec.serialize({
      elements: api!.getSceneElements(),
      appState: api!.getAppState(),
      files: api!.getFiles(),
    });
    const reopened = await codec.deserialize(saved.sceneJson, async () => undefined);
    return {
      restore: restored.elements.find((e) => e.id === 'A')?.link,
      codec: reopened.elements.find((e) => e.id === 'A')?.link,
    };
  });

  // c) Clic en el icono de enlace: onLinkOpen lo recibe y el producto lo intercepta.
  const a = (await elementById(page, 'A'))!;
  const icon = await toViewport(page, a.x + a.width + 8, a.y - 8);
  let popups = 0;
  context.on('page', () => popups++);
  await page.mouse.click(icon.x, icon.y);
  await page.waitForTimeout(300);
  out['onLinkOpen'] = await page.evaluate(() => window.fase0.linkOpens);
  out['ventanasAbiertas'] = popups;

  // d) Escrito por el usuario en el editor de enlaces del motor (Ctrl+K).
  await page.evaluate(() => {
    const { api } = window.fase0;
    api!.updateScene({ appState: { selectedElementIds: { B: true } } });
  });
  await page.keyboard.press('ControlOrMeta+k');
  await page.waitForTimeout(200);
  const input = page.locator('.excalidraw-hyperlinkContainer-input');
  out['editorUiDisponible'] = (await input.count()) > 0;
  if (await input.count()) {
    await input.fill(DOC);
    await input.press('Enter');
    await page.waitForTimeout(200);
    out['viaEditorUi'] = (await elementById(page, 'B'))?.link ?? null;
  }

  record('0.2_enlace', out);
  expect(out['viaApi']).toBe(DOC);
  expect(out['roundTrip']).toEqual({ restore: DOC, codec: DOC });
});

test('0.3 customData en guardado, duplicado, copia y deshacer', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openHarness(page);
  await mountSmall(page);
  const mark = { mindnote: { nodeId: 'nodo-A' } };
  const out: Record<string, unknown> = {};

  await page.evaluate((cd) => {
    const { api, lib } = window.fase0;
    api!.updateScene({
      elements: api!
        .getSceneElements()
        .map((e) => (e.id === 'A' ? lib.newElementWith(e, { customData: cd }) : e)),
      captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
    });
  }, mark);

  out['roundTrip'] = await page.evaluate(async () => {
    const { api, codec } = window.fase0;
    const saved = await codec.serialize({
      elements: api!.getSceneElements(),
      appState: api!.getAppState(),
      files: api!.getFiles(),
    });
    const reopened = await codec.deserialize(saved.sceneJson, async () => undefined);
    return reopened.elements.find((e) => e.id === 'A')?.customData ?? null;
  });

  const countWithMark = () =>
    page.evaluate(
      () =>
        window.fase0
          .api!.getSceneElements()
          .filter(
            (e) =>
              (e.customData as { mindnote?: { nodeId?: string } } | undefined)?.mindnote?.nodeId ===
              'nodo-A',
          ).length,
    );

  // Duplicar (Ctrl+D) con A seleccionado.
  await page.evaluate(() =>
    window.fase0.api!.updateScene({ appState: { selectedElementIds: { A: true } } }),
  );
  await page.locator('.excalidraw').focus();
  await page.keyboard.press('ControlOrMeta+d');
  await page.waitForTimeout(200);
  out['trasDuplicar_elementosConMarca'] = await countWithMark();

  // Copiar y pegar.
  await page.evaluate(() =>
    window.fase0.api!.updateScene({ appState: { selectedElementIds: { A: true } } }),
  );
  await page.keyboard.press('ControlOrMeta+c');
  await page.waitForTimeout(200);
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(400);
  out['trasCopiarPegar_elementosConMarca'] = await countWithMark();

  // Cambiar customData y deshacer.
  await page.evaluate(() => {
    const { api, lib } = window.fase0;
    api!.updateScene({
      elements: api!
        .getSceneElements()
        .map((e) =>
          e.id === 'A'
            ? lib.newElementWith(e, { customData: { mindnote: { nodeId: 'cambiado' } } })
            : e,
        ),
      captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
    });
  });
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  out['trasDeshacer'] = (await elementById(page, 'A'))?.customData ?? null;

  record('0.3_customData', out);
  expect(out['roundTrip']).toEqual(mark);
});

test('0.5 borrar un extremo deja el conector suelto (RN-07)', async ({ page }) => {
  await openHarness(page);
  await mountSmall(page, [
    { type: 'arrow', id: 'F', x: 260, y: 190, start: { id: 'A' }, end: { id: 'B' } },
  ]);
  const out: Record<string, unknown> = {};
  const arrowState = async () => {
    const f = await elementById(page, 'F');
    return (
      f && {
        existe: true,
        borrada: f.isDeleted,
        startBinding:
          (f as { startBinding: { elementId: string } | null }).startBinding?.elementId ?? null,
        endBinding:
          (f as { endBinding: { elementId: string } | null }).endBinding?.elementId ?? null,
      }
    );
  };
  out['inicial'] = await arrowState();

  await page.evaluate(() =>
    window.fase0.api!.updateScene({ appState: { selectedElementIds: { B: true } } }),
  );
  await page.locator('.excalidraw').focus();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  out['trasBorrarB'] = await arrowState();
  out['B_borrado'] = (await elementById(page, 'B'))?.isDeleted ?? null;

  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  out['trasDeshacer'] = await arrowState();
  out['B_trasDeshacer_borrado'] = (await elementById(page, 'B'))?.isDeleted ?? null;

  record('0.5_conectorSuelto', out);
  expect(out['inicial']).toMatchObject({ startBinding: 'A', endBinding: 'B' });
});

async function mountTree(page: Page) {
  await page.evaluate(async () => {
    const { lib } = window.fase0;
    const node = (id: string, x: number, y: number, text: string) => ({
      type: 'rectangle',
      id,
      x,
      y,
      width: 140,
      height: 60,
      label: { text },
    });
    const elements = lib.convertToExcalidrawElements(
      [
        node('R', 100, 250, 'RAIZ'),
        node('C1', 400, 120, 'HIJO-1'),
        node('C2', 400, 380, 'HIJO-2'),
        node('G1', 700, 120, 'NIETO-1'),
        { type: 'arrow', id: 'aRC1', x: 240, y: 280, start: { id: 'R' }, end: { id: 'C1' } },
        { type: 'arrow', id: 'aRC2', x: 240, y: 280, start: { id: 'R' }, end: { id: 'C2' } },
        { type: 'arrow', id: 'aC1G1', x: 540, y: 150, start: { id: 'C1' }, end: { id: 'G1' } },
      ] as Parameters<typeof lib.convertToExcalidrawElements>[0],
      { regenerateIds: false },
    );
    await window.fase0.mount(elements);
  });
}

const PARENTS = { C1: 'R', C2: 'R', G1: 'C1' };

test('0.6 proyección de rama colapsada y deshacer', async ({ page }) => {
  await openHarness(page);
  await mountTree(page);
  const out: Record<string, unknown> = {};
  const snapshot = () =>
    page.evaluate(() =>
      Object.fromEntries(
        window.fase0
          .api!.getSceneElementsIncludingDeleted()
          .map((e) => [e.id, { x: e.x, y: e.y, del: e.isDeleted }]),
      ),
    );
  const initial = await snapshot();
  out['elementosIniciales'] = Object.keys(initial).length;

  // Acción registrada antes de colapsar: mover C2 (para probar el deshacer sobre ocultos).
  await page.evaluate(() => {
    const { api, lib } = window.fase0;
    api!.updateScene({
      elements: api!
        .getSceneElements()
        .map((e) => (e.id === 'C2' ? lib.newElementWith(e, { y: e.y + 40 }) : e)),
      captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
    });
  });

  // Colapsar la raíz.
  const hiddenIds = await page.evaluate((parents) => {
    const w = window as unknown as { __proj: ReturnType<typeof window.fase0.projection> };
    w.__proj = window.fase0.projection();
    return w.__proj.collapse('R', parents);
  }, PARENTS);
  out['ocultos'] = hiddenIds.length;
  out['visiblesTrasColapsar'] = await page.evaluate(() =>
    window.fase0.api!.getSceneElements().map((e) => e.id),
  );

  // 0.7 Exportación de la proyección visible.
  out['0.7_exportacion'] = await page.evaluate(async () => {
    const { api, lib } = window.fase0;
    const visible = api!.getSceneElements();
    const svg = await lib.exportToSvg({
      elements: visible,
      appState: api!.getAppState(),
      files: api!.getFiles(),
    });
    const text = svg.textContent ?? '';
    const png = await lib.exportToBlob({
      elements: visible,
      appState: api!.getAppState(),
      files: api!.getFiles(),
      mimeType: 'image/png',
    });
    return {
      svgContieneRAIZ: text.includes('RAIZ'),
      svgContieneOcultos: ['HIJO-1', 'HIJO-2', 'NIETO-1'].some((t) => text.includes(t)),
      svgAncho: svg.getAttribute('width'),
      pngBytes: png.size,
    };
  });

  // Deshacer con la rama colapsada: ¿reaparecen o cambian los ocultos?
  await page.locator('.excalidraw').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  out['deshacerConColapso'] = await page.evaluate(() => {
    const ids = window.fase0
      .api!.getSceneElementsIncludingDeleted()
      .map((e) => ({ id: e.id, del: e.isDeleted }));
    return { enEscena: ids, C2: ids.find((e) => e.id === 'C2') ?? null };
  });

  // Mover la raíz con el ratón mientras está colapsada.
  const r = (await elementById(page, 'R'))!;
  const start = await toViewport(page, r.x + 20, r.y + 20);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const rMoved = (await elementById(page, 'R'))!;

  // Expandir.
  await page.evaluate(() => (window as unknown as { __proj: { expand(): void } }).__proj.expand());
  await page.waitForTimeout(200);
  const expanded = await snapshot();
  out['trasExpandir'] = {
    elementos: Object.keys(expanded).length,
    G1_conservaPosicion:
      expanded['G1']?.x === initial['G1']?.x && expanded['G1']?.y === initial['G1']?.y,
    R_movido: rMoved.x !== r.x,
  };
  // ¿El conector oculto R→C1 sigue a la raíz movida?
  out['conectorTrasExpandir'] = await page.evaluate(() => {
    const els = window.fase0.api!.getSceneElements();
    const R = els.find((e) => e.id === 'R')!;
    const a = els.find((e) => e.id === 'aRC1') as unknown as {
      x: number;
      y: number;
      points: [number, number][];
    };
    const sx = a.x + a.points[0]![0];
    const sy = a.y + a.points[0]![1];
    const dx = Math.max(R.x - sx, 0, sx - (R.x + R.width));
    const dy = Math.max(R.y - sy, 0, sy - (R.y + R.height));
    return { distanciaInicioARaiz: Math.round(Math.hypot(dx, dy)) };
  });

  // Mover la raíz después de expandir: ¿el motor recoloca el conector?
  const r2 = (await elementById(page, 'R'))!;
  const s2 = await toViewport(page, r2.x + 20, r2.y + 20);
  await page.mouse.move(s2.x, s2.y);
  await page.mouse.down();
  await page.mouse.move(s2.x + 10, s2.y + 10, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  out['conectorTrasMoverDeNuevo'] = await page.evaluate(() => {
    const els = window.fase0.api!.getSceneElements();
    const R = els.find((e) => e.id === 'R')!;
    const a = els.find((e) => e.id === 'aRC1') as unknown as {
      x: number;
      y: number;
      points: [number, number][];
    };
    const sx = a.x + a.points[0]![0];
    const sy = a.y + a.points[0]![1];
    const dx = Math.max(R.x - sx, 0, sx - (R.x + R.width));
    const dy = Math.max(R.y - sy, 0, sy - (R.y + R.height));
    return { distanciaInicioARaiz: Math.round(Math.hypot(dx, dy)) };
  });

  // Deshacer tras expandir: ¿se pierde algún elemento?
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  out['deshacerTrasExpandir'] = await page.evaluate(() => {
    const els = window.fase0.api!.getSceneElements();
    return { visibles: els.length, ids: els.map((e) => e.id).sort() };
  });

  record('0.6_proyeccion', out);
  expect(hiddenIds.length).toBeGreaterThan(0);
});

test('0.6c proyección alternativa: ocultos en escena (opacidad 0 y bloqueados)', async ({
  page,
}) => {
  await openHarness(page);
  await mountTree(page);
  const out: Record<string, unknown> = {};
  const total = () => page.evaluate(() => window.fase0.api!.getSceneElements().length);
  const initialCount = await total();
  const g1Initial = (await elementById(page, 'G1'))!;

  // Misma secuencia que rompió la proyección ingenua: acción registrada, colapsar, deshacer.
  await page.evaluate(() => {
    const { api, lib } = window.fase0;
    api!.updateScene({
      elements: api!
        .getSceneElements()
        .map((e) => (e.id === 'C2' ? lib.newElementWith(e, { y: e.y + 40 }) : e)),
      captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
    });
  });
  const hidden = await page.evaluate((parents) => {
    const w = window as unknown as { __op: ReturnType<typeof window.fase0.opacityProjection> };
    w.__op = window.fase0.opacityProjection();
    return w.__op.collapse('R', parents);
  }, PARENTS);
  out['ocultos'] = hidden.length;

  // Seleccionar todo no debe incluir ocultos (están bloqueados).
  await page.locator('.excalidraw').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.waitForTimeout(150);
  out['seleccionarTodo'] = await page.evaluate(() =>
    Object.keys(window.fase0.api!.getAppState().selectedElementIds),
  );
  await page.keyboard.press('Escape');

  // Clic donde está un nodo oculto: no debe seleccionarlo.
  const g1 = (await elementById(page, 'G1'))!;
  const g1p = await toViewport(page, g1.x + 30, g1.y + 30);
  await page.mouse.click(g1p.x, g1p.y);
  await page.waitForTimeout(150);
  out['clicSobreOculto_selecciona'] = await page.evaluate(() =>
    Object.keys(window.fase0.api!.getAppState().selectedElementIds),
  );

  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  const c2 = (await elementById(page, 'C2'))!;
  out['deshacerConColapso'] = {
    C2_borrado: c2.isDeleted,
    C2_opacidad: c2.opacity,
    C2_y: c2.y,
    elementos: await total(),
  };

  // Mover la raíz colapsada: el conector oculto debe seguirla.
  const r = (await elementById(page, 'R'))!;
  const p = await toViewport(page, r.x + 20, r.y + 20);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 120, p.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  // Exportación de lo visible filtrando los ocultos.
  out['exportacion'] = await page.evaluate(async () => {
    const { api, lib } = window.fase0;
    const w = window as unknown as { __op: { isHidden(id: string): boolean } };
    const visible = api!.getSceneElements().filter((e) => !w.__op.isHidden(e.id));
    const svg = await lib.exportToSvg({
      elements: visible,
      appState: api!.getAppState(),
      files: api!.getFiles(),
    });
    const text = svg.textContent ?? '';
    return {
      contieneRAIZ: text.includes('RAIZ'),
      contieneOcultos: ['HIJO-1', 'HIJO-2', 'NIETO-1'].some((t) => text.includes(t)),
    };
  });

  await page.evaluate(() => (window as unknown as { __op: { expand(): void } }).__op.expand());
  await page.waitForTimeout(200);
  out['trasExpandir'] = await page.evaluate(() => {
    const els = window.fase0.api!.getSceneElements();
    const R = els.find((e) => e.id === 'R')!;
    const a = els.find((e) => e.id === 'aRC1') as unknown as {
      x: number;
      y: number;
      points: [number, number][];
    };
    const sx = a.x + a.points[0]![0];
    const sy = a.y + a.points[0]![1];
    const dx = Math.max(R.x - sx, 0, sx - (R.x + R.width));
    const dy = Math.max(R.y - sy, 0, sy - (R.y + R.height));
    return {
      elementos: els.length,
      opacidadesRestauradas: els.every((e) => e.opacity === 100),
      bloqueados: els.filter((e) => e.locked).length,
      distanciaInicioConectorARaiz: Math.round(Math.hypot(dx, dy)),
    };
  });
  const g1After = (await elementById(page, 'G1'))!;
  out['G1_conservaPosicion'] = g1After.x === g1Initial.x && g1After.y === g1Initial.y;

  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  out['deshacerTrasExpandir'] = {
    elementos: await total(),
    borrados: await page.evaluate(() =>
      window.fase0
        .api!.getSceneElementsIncludingDeleted()
        .filter((e) => e.isDeleted)
        .map((e) => e.id),
    ),
  };
  out['elementosIniciales'] = initialCount;

  record('0.6c_proyeccionOpacidad', out);
  expect((out['trasExpandir'] as { elementos: number }).elementos).toBe(initialCount);
  expect((out['deshacerTrasExpandir'] as { elementos: number }).elementos).toBe(initialCount);
});

test('0.6b 100 acciones de deshacer y rehacer (CA-22)', async ({ page }) => {
  await openHarness(page);
  await mountSmall(page);
  const x0 = (await elementById(page, 'A'))!.x;
  for (let i = 0; i < 100; i++) {
    await page.evaluate(() => {
      const { api, lib } = window.fase0;
      api!.updateScene({
        elements: api!
          .getSceneElements()
          .map((e) => (e.id === 'A' ? lib.newElementWith(e, { x: e.x + 5 }) : e)),
        captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
      });
    });
  }
  const x100 = (await elementById(page, 'A'))!.x;
  await page.locator('.excalidraw').focus();
  for (let i = 0; i < 100; i++) await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  const afterUndo = (await elementById(page, 'A'))!.x;
  for (let i = 0; i < 100; i++) await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.waitForTimeout(200);
  const afterRedo = (await elementById(page, 'A'))!.x;
  const out = {
    x0,
    x100,
    afterUndo,
    afterRedo,
    undoVuelveAlInicio: afterUndo === x0,
    redoVuelveAlFinal: afterRedo === x100,
  };
  record('0.6b_deshacer100', out);
  expect(out.undoVuelveAlInicio).toBe(true);
});

test('0.4 (indicativa) modo lápiz con eventos de Chromium', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.fase0.mount([]));
  const cdp = await page.context().newCDPSession(page);
  const freedraws = () =>
    page.evaluate(
      () => window.fase0.api!.getSceneElements().filter((e) => e.type === 'freedraw').length,
    );

  const penStroke = async (x: number, y: number) => {
    const ev = (type: string, px: number, py: number, buttons: number) =>
      cdp.send('Input.dispatchMouseEvent', {
        type: type as 'mousePressed',
        x: px,
        y: py,
        button: 'left',
        buttons,
        clickCount: 1,
        pointerType: 'pen',
        force: 0.5,
      });
    await ev('mouseMoved', x, y, 0);
    await ev('mousePressed', x, y, 1);
    for (let i = 1; i <= 10; i++) await ev('mouseMoved', x + i * 10, y + i * 4, 1);
    await ev('mouseReleased', x + 100, y + 40, 0);
  };
  const touchStroke = async (x: number, y: number) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + i * 10, y: y + i * 4, id: 1 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  const out: Record<string, unknown> = {};
  await page.evaluate(() => window.fase0.api!.setActiveTool({ type: 'freedraw' }));

  await penStroke(500, 300);
  await page.waitForTimeout(200);
  out['trasLapiz'] = {
    trazos: await freedraws(),
    pen: await page.evaluate(() => ({ ...window.fase0.pen })),
  };

  await page.evaluate(() => window.fase0.api!.setActiveTool({ type: 'freedraw' }));
  await touchStroke(500, 450);
  await page.waitForTimeout(200);
  out['toqueConPenMode'] = {
    trazos: await freedraws(),
    penMode: await page.evaluate(() => window.fase0.pen.penMode),
  };

  await page.evaluate(() => {
    window.fase0.api!.updateScene({ appState: { penMode: false } });
    window.fase0.api!.setActiveTool({ type: 'freedraw' });
  });
  await touchStroke(700, 450);
  await page.waitForTimeout(200);
  out['toqueSinPenMode'] = { trazos: await freedraws() };

  // Guardar y reabrir el trazo del lápiz con el códec del producto.
  out['trazoTrasReabrir'] = await page.evaluate(async () => {
    const { api, codec } = window.fase0;
    const before = api!.getSceneElements().find((e) => e.type === 'freedraw') as unknown as {
      id: string;
      points: [number, number][];
      pressures: number[];
      simulatePressure: boolean;
    };
    const saved = await codec.serialize({
      elements: api!.getSceneElements(),
      appState: api!.getAppState(),
      files: api!.getFiles(),
    });
    const after = (await codec.deserialize(saved.sceneJson, async () => undefined)).elements.find(
      (e) => e.id === before.id,
    ) as unknown as typeof before;
    return {
      puntos: before.points.length,
      puntosIguales: JSON.stringify(before.points) === JSON.stringify(after.points),
      presionesIguales: JSON.stringify(before.pressures) === JSON.stringify(after.pressures),
      simulatePressure: after.simulatePressure,
    };
  });

  record('0.4_lapiz_indicativo', out);
});
