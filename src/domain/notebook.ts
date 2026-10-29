import { z } from './zod.ts';

/**
 * Cuaderno (plan 13, desde el 28/10/2026): un lienzo con páginas, como GoodNotes. Es un lienzo
 * (`kind: 'canvas'`) cuyo sidecar lleva `notebook` (formato §2.5); cada página es un marco del motor
 * (`type: 'frame'`) bloqueado, y el orden de las páginas es el de sus marcos de arriba abajo (así
 * deshacer y rehacer nunca dejan el orden y las páginas desparejados). Solo se dibuja dentro de las
 * páginas. Aquí, la geometría pura: tamaños, posiciones, a qué página pertenece un punto y los
 * límites del desplazamiento.
 */
export const PAGE_SIZES = ['a4', 'letter'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const PAGE_ORIENTATIONS = ['portrait', 'landscape'] as const;
export type PageOrientation = (typeof PAGE_ORIENTATIONS)[number];

export const notebookSchema = z.object({
  size: z.enum(PAGE_SIZES),
  orientation: z.enum(PAGE_ORIENTATIONS),
});
export type NotebookLayout = z.infer<typeof notebookSchema>;

export const DEFAULT_NOTEBOOK: NotebookLayout = { size: 'a4', orientation: 'portrait' };

/** Tamaño en vertical, en unidades de la escena (píxeles CSS a 96 ppp). */
const PORTRAIT: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
};
/** Separación entre páginas y margen alrededor de la columna, en unidades de la escena. */
export const PAGE_GAP = 40;
export const DESK_MARGIN = 120;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pageSize(layout: NotebookLayout): { width: number; height: number } {
  const { width, height } = PORTRAIT[layout.size];
  return layout.orientation === 'portrait' ? { width, height } : { width: height, height: width };
}

/** Rectángulo de la página `index` (desde 0): una columna desde el origen hacia abajo. */
export function pageRect(layout: NotebookLayout, index: number): Rect {
  const { width, height } = pageSize(layout);
  return { x: 0, y: index * (height + PAGE_GAP), width, height };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Índice de la página que contiene un punto, o -1 si cae en la mesa (fuera de las páginas). */
export function pageIndexAt(pages: readonly Rect[], x: number, y: number): number {
  return pages.findIndex((page) => contains(page, x, y));
}

/** Página más cercana a un punto (la de su altura, o la primera o la última). */
export function nearestPageIndex(pages: readonly Rect[], x: number, y: number): number {
  if (pages.length === 0) return -1;
  let best = 0;
  let bestDistance = Infinity;
  pages.forEach((page, i) => {
    const dx = Math.max(page.x - x, 0, x - (page.x + page.width));
    const dy = Math.max(page.y - y, 0, y - (page.y + page.height));
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

/** Desplazamiento que mete un rectángulo dentro de una página (lo más corto posible). */
export function moveInside(rect: Rect, page: Rect): { dx: number; dy: number } {
  const fit = (start: number, size: number, min: number, room: number) => {
    if (size >= room) return min - start; // no cabe: se alinea al principio
    if (start < min) return min - start;
    if (start + size > min + room) return min + room - (start + size);
    return 0;
  };
  return {
    dx: fit(rect.x, rect.width, page.x, page.width),
    dy: fit(rect.y, rect.height, page.y, page.height),
  };
}

export interface View {
  scrollX: number;
  scrollY: number;
  zoom: number;
  /** Tamaño de la vista en píxeles de pantalla. */
  width: number;
  height: number;
}

/**
 * Desplazamiento permitido: la columna de páginas no se pierde de vista. En horizontal, si la
 * página cabe, queda centrada; si no, se puede mover hasta sus bordes (con un margen). En vertical,
 * desde un margen por encima de la primera página hasta otro por debajo de la última.
 */
export function clampScroll(view: View, column: Rect): { scrollX: number; scrollY: number } {
  const visibleWidth = view.width / view.zoom;
  const visibleHeight = view.height / view.zoom;
  const range = (start: number, size: number, visible: number, margin: number) => {
    // scroll = -inicio visible: el contenido [start, start + size] con su margen.
    const min = visible - (start + size + margin);
    const max = margin - start;
    return { min: Math.min(min, max), max };
  };
  let scrollX: number;
  if (column.width + 2 * PAGE_GAP <= visibleWidth) {
    scrollX = (visibleWidth - column.width) / 2 - column.x;
  } else {
    const r = range(column.x, column.width, visibleWidth, PAGE_GAP);
    scrollX = Math.min(r.max, Math.max(r.min, view.scrollX));
  }
  const ry = range(column.y, column.height, visibleHeight, DESK_MARGIN);
  const scrollY = Math.min(ry.max, Math.max(ry.min, view.scrollY));
  return { scrollX, scrollY };
}

/** Columna que ocupan `count` páginas. */
export function columnRect(layout: NotebookLayout, count: number): Rect {
  const { width, height } = pageSize(layout);
  const n = Math.max(1, count);
  return { x: 0, y: 0, width, height: n * height + (n - 1) * PAGE_GAP };
}

/** Página cuyo centro está más cerca del centro de la vista: la «página actual». */
export function currentPageIndex(view: View, pages: readonly Rect[]): number {
  const cx = view.width / 2 / view.zoom - view.scrollX;
  const cy = view.height / 2 / view.zoom - view.scrollY;
  return nearestPageIndex(pages, cx, cy);
}
