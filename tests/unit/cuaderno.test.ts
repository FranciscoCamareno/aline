import { describe, expect, it } from 'vitest';
import { DESK_COLOR, deskColorFor } from '../../src/features/canvas/canvasBackdrop.ts';
import {
  clampScroll,
  columnRect,
  currentPageIndex,
  DEFAULT_NOTEBOOK,
  moveInside,
  nearestPageIndex,
  pageIndexAt,
  pageRect,
  pageSize,
  PAGE_GAP,
} from '../../src/domain/notebook.ts';

const layout = DEFAULT_NOTEBOOK;
const pages = [0, 1, 2].map((i) => pageRect(layout, i));

describe('cuaderno: geometría de las páginas (plan 13)', () => {
  it('A4 y Carta en vertical y horizontal; columna desde el origen', () => {
    expect(pageSize(layout)).toEqual({ width: 794, height: 1123 });
    expect(pageSize({ size: 'letter', orientation: 'landscape' })).toEqual({
      width: 1056,
      height: 816,
    });
    expect(pages[1]).toEqual({ x: 0, y: 1123 + PAGE_GAP, width: 794, height: 1123 });
    expect(columnRect(layout, 3).height).toBe(3 * 1123 + 2 * PAGE_GAP);
  });

  it('qué página contiene un punto, la mesa entre páginas y la más cercana', () => {
    expect(pageIndexAt(pages, 10, 10)).toBe(0);
    expect(pageIndexAt(pages, 10, 1123 + PAGE_GAP / 2)).toBe(-1);
    expect(pageIndexAt(pages, -5, 10)).toBe(-1);
    expect(nearestPageIndex(pages, 900, 1300)).toBe(1);
    expect(nearestPageIndex(pages, 100, 99999)).toBe(2);
  });

  it('meter un elemento dentro de su página por el camino más corto', () => {
    expect(moveInside({ x: 780, y: 10, width: 50, height: 20 }, pages[0]!)).toEqual({
      dx: -36,
      dy: 0,
    });
    expect(moveInside({ x: 100, y: -30, width: 50, height: 20 }, pages[0]!)).toEqual({
      dx: 0,
      dy: 30,
    });
    expect(moveInside({ x: 100, y: 100, width: 50, height: 20 }, pages[0]!)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('el desplazamiento no pierde la columna: centrada en horizontal si cabe', () => {
    const column = columnRect(layout, 3);
    const wide = clampScroll(
      { scrollX: 5000, scrollY: 5000, zoom: 1, width: 1600, height: 900 },
      column,
    );
    expect(wide.scrollX).toBe((1600 - 794) / 2);
    expect(wide.scrollY).toBe(120);
    const down = clampScroll(
      { scrollX: 0, scrollY: -999999, zoom: 1, width: 1600, height: 900 },
      column,
    );
    expect(down.scrollY).toBe(900 - (column.height + 120));
    // Con zoom, la página no cabe a lo ancho: se mueve hasta sus bordes.
    const zoomed = clampScroll(
      { scrollX: 500, scrollY: 0, zoom: 3, width: 1200, height: 900 },
      column,
    );
    expect(zoomed.scrollX).toBe(PAGE_GAP);
  });

  it('la página actual es la del centro de la vista', () => {
    const view = { scrollX: 400, scrollY: -(1123 + PAGE_GAP), zoom: 1, width: 1600, height: 900 };
    expect(currentPageIndex(view, pages)).toBe(1);
  });
});

describe('cuaderno: la mesa siempre se distingue del papel', () => {
  it('el color del fondo cambia solo el papel; si se parece a la mesa, la mesa cambia', () => {
    expect(deskColorFor('#ffffff')).toBe(DESK_COLOR);
    expect(deskColorFor('#121212')).toBe(DESK_COLOR);
    expect(deskColorFor(DESK_COLOR)).not.toBe(DESK_COLOR);
    expect(deskColorFor('#d0c9b8')).not.toBe(DESK_COLOR);
    // Un color que no es hexadecimal (transparente, nombre) deja la mesa de siempre.
    expect(deskColorFor('transparent')).toBe(DESK_COLOR);
  });
});
