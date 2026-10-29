import {
  convertToExcalidrawElements,
  getCommonBounds,
  newElementWith,
} from '@excalidraw/excalidraw';
import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
  NonDeleted,
} from '@excalidraw/excalidraw/element/types';
import {
  moveInside,
  nearestPageIndex,
  pageIndexAt,
  pageRect,
  type NotebookLayout,
  type Rect,
} from '../../domain/notebook.ts';
import { cloneElements } from './cloneElements.ts';

/**
 * Cuaderno sobre el motor (plan 13): cada página es un marco bloqueado y su orden es el de arriba
 * abajo. Aquí, las operaciones sobre la escena; `CanvasView` decide cuándo aplicarlas (las de la
 * persona como un paso de deshacer; la proyección que coloca cada elemento en su página, fuera del
 * historial, igual que las ramas plegadas, plan 9.25).
 */

type Element = ExcalidrawElement & { containerId?: string | null };

export function isPage(el: ExcalidrawElement): el is ExcalidrawFrameElement {
  return el.type === 'frame' && !el.isDeleted;
}

/** Páginas del cuaderno, de arriba abajo. */
export function notebookPages(elements: readonly ExcalidrawElement[]): ExcalidrawFrameElement[] {
  return elements.filter(isPage).sort((a, b) => a.y - b.y || a.x - b.x);
}

export function rectOf(el: ExcalidrawElement): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

function boundsOf(elements: readonly ExcalidrawElement[]): Rect {
  const [minX, minY, maxX, maxY] = getCommonBounds(elements as NonDeleted<ExcalidrawElement>[]);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Marco nuevo de página, bloqueado y sin nombre visible (la página la numera la aplicación). */
export function newPage(layout: NotebookLayout, index: number): ExcalidrawFrameElement {
  const [frame] = convertToExcalidrawElements([
    { type: 'frame', children: [], ...pageRect(layout, index) },
  ]);
  return { ...(frame as ExcalidrawFrameElement), locked: true };
}

/**
 * Proyección del cuaderno, sin pasar por el historial: cada página en su sitio y bloqueada, y
 * cada elemento suelto dentro de una página y como parte de ella (para que el marco lo recorte).
 * Lo que cae fuera de las páginas vuelve a la más cercana: solo se dibuja dentro. Los textos
 * ligados siguen a su contenedor. null si no hay nada que cambiar.
 */
export function projectNotebook(
  elements: readonly ExcalidrawElement[],
  layout: NotebookLayout,
): ExcalidrawElement[] | null {
  const pages = notebookPages(elements);
  if (pages.length === 0) return null;
  const changed = new Map<string, ExcalidrawElement>();
  pages.forEach((page, i) => {
    const want = pageRect(layout, i);
    if (
      !page.locked ||
      page.x !== want.x ||
      page.y !== want.y ||
      page.width !== want.width ||
      page.height !== want.height
    ) {
      changed.set(page.id, newElementWith(page, { ...want, locked: true }));
    }
  });
  const rects = pages.map((_, i) => pageRect(layout, i));
  const byId = new Map(elements.map((e) => [e.id, e as Element]));
  // Contenedores de textos ligados: el texto va con su contenedor.
  const boundTexts = new Map<string, Element[]>();
  for (const el of elements as readonly Element[]) {
    if (el.isDeleted || !el.containerId || !byId.has(el.containerId)) continue;
    boundTexts.set(el.containerId, [...(boundTexts.get(el.containerId) ?? []), el]);
  }
  for (const el of elements as readonly Element[]) {
    if (el.isDeleted || el.type === 'frame' || (el.containerId && byId.has(el.containerId))) {
      continue;
    }
    const box = rectOf(el);
    const bounds =
      el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw' ? boundsOf([el]) : box;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    let index = pageIndexAt(rects, cx, cy);
    let dx = 0;
    let dy = 0;
    if (index < 0) {
      index = nearestPageIndex(rects, cx, cy);
      ({ dx, dy } = moveInside(bounds, rects[index]!));
    }
    const frameId = pages[index]!.id;
    if (el.frameId === frameId && !dx && !dy) continue;
    const move = (e: Element) =>
      changed.set(e.id, newElementWith(e, { x: e.x + dx, y: e.y + dy, frameId }));
    move(el);
    for (const text of boundTexts.get(el.id) ?? []) move(text);
  }
  if (changed.size === 0) return null;
  return elements.map((e) => changed.get(e.id) ?? e);
}

/** Elementos de una página (los que tienen su marco), sin el marco. */
function pageContent(elements: readonly ExcalidrawElement[], pageId: string) {
  return elements.filter((e) => !e.isDeleted && e.frameId === pageId);
}

/** Desplaza en vertical las páginas desde `from` (y su contenido). */
function shiftPages(
  elements: readonly ExcalidrawElement[],
  pages: readonly ExcalidrawFrameElement[],
  from: number,
  dy: number,
): Map<string, ExcalidrawElement> {
  const moved = new Map<string, ExcalidrawElement>();
  for (const page of pages.slice(from)) {
    for (const el of [page, ...pageContent(elements, page.id)]) {
      moved.set(el.id, newElementWith(el, { y: el.y + dy }));
    }
  }
  return moved;
}

const step = (layout: NotebookLayout) => pageRect(layout, 1).y - pageRect(layout, 0).y;

/** Página nueva en blanco después de `after` (al final si es la última). */
export function addPage(
  elements: readonly ExcalidrawElement[],
  layout: NotebookLayout,
  after: number,
): ExcalidrawElement[] {
  const pages = notebookPages(elements);
  const moved = shiftPages(elements, pages, after + 1, step(layout));
  return [...elements.map((e) => moved.get(e.id) ?? e), newPage(layout, after + 1)];
}

/** Copia de la página `index` (con su contenido, ids nuevos) justo después de ella. */
export function duplicatePage(
  elements: readonly ExcalidrawElement[],
  layout: NotebookLayout,
  index: number,
): ExcalidrawElement[] {
  const pages = notebookPages(elements);
  const page = pages[index];
  if (!page) return [...elements];
  const moved = shiftPages(elements, pages, index + 1, step(layout));
  const copy = cloneElements([page, ...pageContent(elements, page.id)], { x: 0, y: step(layout) });
  return [...elements.map((e) => moved.get(e.id) ?? e), ...copy];
}

/** Borra la página `index` y su contenido; las siguientes suben. Nunca la última que queda. */
export function deletePage(
  elements: readonly ExcalidrawElement[],
  layout: NotebookLayout,
  index: number,
): ExcalidrawElement[] {
  const pages = notebookPages(elements);
  const page = pages[index];
  if (!page || pages.length < 2) return [...elements];
  const gone = new Set([page.id, ...pageContent(elements, page.id).map((e) => e.id)]);
  const moved = shiftPages(elements, pages, index + 1, -step(layout));
  return elements.map((e) =>
    gone.has(e.id) ? newElementWith(e, { isDeleted: true }) : (moved.get(e.id) ?? e),
  );
}

/** Mueve la página `from` a la posición `to` (las demás se recolocan). */
export function movePage(
  elements: readonly ExcalidrawElement[],
  layout: NotebookLayout,
  from: number,
  to: number,
): ExcalidrawElement[] {
  const pages = notebookPages(elements);
  if (from === to || !pages[from] || to < 0 || to >= pages.length) return [...elements];
  const order = [...pages];
  const [page] = order.splice(from, 1);
  order.splice(to, 0, page!);
  const moved = new Map<string, ExcalidrawElement>();
  order.forEach((p, i) => {
    const dy = pageRect(layout, i).y - p.y;
    if (!dy) return;
    for (const el of [p, ...pageContent(elements, p.id)]) {
      moved.set(el.id, newElementWith(el, { y: el.y + dy }));
    }
  });
  return elements.map((e) => moved.get(e.id) ?? e);
}
