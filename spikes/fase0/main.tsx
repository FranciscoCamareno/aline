/**
 * Banco de pruebas de la fase 0 (diseño §17). Expone el motor real en window.fase0 para que
 * Playwright ejecute las pruebas, y muestra un panel de diagnóstico del lápiz para el iPad.
 * No forma parte del producto ni de su compilación.
 */
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  newElementWith,
  restore,
  sceneCoordsToViewportCoords,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { excalidrawCanvasAdapter } from '../../src/adapters/excalidraw/sceneCodec.ts';
import type { PenStats } from './fase0-api.ts';
import { BranchProjection, OpacityProjection } from './projection.ts';

type Elements = readonly ExcalidrawElement[];

window.EXCALIDRAW_ASSET_PATH = '/';

const pen: PenStats = {
  pointerDown: {},
  freedrawCreated: 0,
  freedrawByPointer: {},
  lastPointerType: null,
  penMode: false,
  penDetected: false,
  pressureSamples: [],
};

let resolveMount: (() => void) | null = null;
let setScene: ((s: { key: number; elements: Elements; files: BinaryFiles }) => void) | null = null;

/** Escena de referencia: 333 nodos con etiqueta, 333 flechas ancladas y un texto suelto. */
function buildThousand(): Elements {
  const skeleton: unknown[] = [];
  const n = 333;
  for (let i = 0; i < n; i++) {
    skeleton.push({
      type: 'rectangle',
      id: `n${i}`,
      x: (i % 20) * 240,
      y: Math.floor(i / 20) * 160,
      width: 160,
      height: 80,
      label: { text: `Nodo ${i}` },
    });
  }
  for (let i = 0; i < n; i++) {
    skeleton.push({
      type: 'arrow',
      x: (i % 20) * 240 + 160,
      y: Math.floor(i / 20) * 160 + 40,
      start: { id: `n${i}` },
      end: { id: `n${(i + 1) % n}` },
    });
  }
  skeleton.push({ type: 'text', x: -300, y: -200, text: 'Texto suelto' });
  return convertToExcalidrawElements(
    skeleton as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
}

let lastThousandMs: number | null = null;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

window.fase0 = {
  api: null,
  linkOpens: [],
  pen,
  lib: {
    CaptureUpdateAction,
    convertToExcalidrawElements,
    exportToBlob,
    exportToSvg,
    newElementWith,
    restore,
    sceneCoordsToViewportCoords,
    serializeAsJSON,
  },
  codec: excalidrawCanvasAdapter,
  async mountThousand() {
    const elements = buildThousand();
    const ms = await window.fase0.mount(elements);
    lastThousandMs = Math.round(ms);
    return { count: elements.length, mountMs: ms };
  },
  projection() {
    if (!window.fase0.api) throw new Error('API no lista');
    return new BranchProjection(window.fase0.api);
  },
  opacityProjection() {
    if (!window.fase0.api) throw new Error('API no lista');
    return new OpacityProjection(window.fase0.api);
  },
  /** Monta de nuevo el motor con una escena y devuelve ms hasta el segundo frame pintado. */
  async mount(elements, files = {}) {
    const start = performance.now();
    window.fase0.api = null;
    const ready = new Promise<void>((r) => (resolveMount = r));
    setScene?.({ key: Math.random(), elements, files });
    await ready;
    await nextFrame();
    await nextFrame();
    return performance.now() - start;
  },
};

function PenPanel({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 300);
    return () => clearInterval(id);
  }, []);
  const pressures = pen.pressureSamples;
  const distinct = new Set(pressures.map((p) => p.toFixed(2))).size;
  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        bottom: 60,
        zIndex: 10,
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid #ccc',
        borderRadius: 8,
        padding: 8,
        font: '12px system-ui',
        maxWidth: 260,
      }}
      data-testid="pen-panel"
    >
      <strong>Diagnóstico de lápiz</strong>
      <div>pointerdown: {JSON.stringify(pen.pointerDown)}</div>
      <div>trazos freedraw: {pen.freedrawCreated}</div>
      <div>trazos por puntero: {JSON.stringify(pen.freedrawByPointer)}</div>
      <div>
        penMode: {String(pen.penMode)} · penDetected: {String(pen.penDetected)}
      </div>
      <div>
        presión: {pressures.length} muestras, {distinct} valores distintos
      </div>
      <div>escena 1 000: {lastThousandMs === null ? '—' : `${lastThousandMs} ms`}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          type="button"
          style={{ minHeight: 44 }}
          onClick={() => api?.updateScene({ appState: { penMode: !pen.penMode } })}
        >
          Alternar penMode
        </button>
        <button
          type="button"
          style={{ minHeight: 44 }}
          onClick={() => void window.fase0.mountThousand()}
        >
          Montar 1 000
        </button>
      </div>
    </div>
  );
}

function Harness() {
  const [scene, setSceneState] = useState<{ key: number; elements: Elements; files: BinaryFiles }>({
    key: 0,
    elements: [],
    files: {},
  });
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => {
    setScene = setSceneState;
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      pen.pointerDown[e.pointerType] = (pen.pointerDown[e.pointerType] ?? 0) + 1;
      pen.lastPointerType = e.pointerType;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'pen' && e.buttons && pen.pressureSamples.length < 2000) {
        pen.pressureSamples.push(e.pressure);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Excalidraw
        key={scene.key}
        initialData={{ elements: scene.elements, files: scene.files }}
        excalidrawAPI={(instance) => {
          window.fase0.api = instance;
          setApi(instance);
          resolveMount?.();
          resolveMount = null;
        }}
        onChange={(elements: Elements, appState: AppState) => {
          pen.penMode = appState.penMode;
          pen.penDetected = appState.penDetected;
          const freedraw = elements.filter((el) => el.type === 'freedraw' && !el.isDeleted).length;
          if (freedraw > pen.freedrawCreated) {
            const by = pen.lastPointerType ?? 'desconocido';
            pen.freedrawByPointer[by] =
              (pen.freedrawByPointer[by] ?? 0) + (freedraw - pen.freedrawCreated);
          }
          pen.freedrawCreated = freedraw;
        }}
        onLinkOpen={(element, event) => {
          window.fase0.linkOpens.push({ elementId: element.id, link: element.link ?? '' });
          // El producto interceptará mindnote:// para abrir el documento dentro de la app.
          if (element.link?.startsWith('mindnote://')) event.preventDefault();
        }}
      />
      <PenPanel api={api} />
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root');
createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
