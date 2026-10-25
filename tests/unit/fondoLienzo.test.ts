import { describe, expect, it } from 'vitest';
import { patternInk, patternMarks, readPattern } from '../../src/domain/canvasBackground.ts';
import { canvasExtensionsSchema, emptyCanvasExtensions } from '../../src/domain/sidecar.ts';

const DOC = '0f9a3c51-7a51-4c3e-9a4b-1c2d3e4f5a6b';

describe('estilo del fondo del lienzo (plan 10.9)', () => {
  it('un patrón desconocido o ausente se muestra liso', () => {
    expect(readPattern('dots')).toBe('dots');
    expect(readPattern('hexágonos')).toBe('plain');
    expect(readPattern(undefined)).toBe('plain');
  });

  it('el sidecar admite la clave opcional y sigue valiendo sin ella', () => {
    const base = emptyCanvasExtensions(DOC);
    expect(canvasExtensionsSchema.safeParse(base).success).toBe(true);
    const parsed = canvasExtensionsSchema.parse({ ...base, background: { pattern: 'grid' } });
    expect(parsed.background).toEqual({ pattern: 'grid' });
  });

  it('las marcas van alineadas con el origen de la escena', () => {
    expect(patternMarks('plain', { x: 0, y: 0, width: 100, height: 100 })).toEqual({
      rows: [],
      columns: [],
      dots: [],
    });
    const lines = patternMarks('lines', { x: -10, y: -10, width: 100, height: 80 });
    expect(lines.rows).toEqual([0, 32, 64]);
    expect(lines.columns).toEqual([]);
    const grid = patternMarks('grid', { x: 5, y: 5, width: 40, height: 20 });
    expect(grid.columns).toEqual([20, 40]);
    expect(grid.rows).toEqual([20]);
    const dots = patternMarks('dots', { x: 0, y: 0, width: 20, height: 20 });
    expect(dots.dots).toEqual([
      [0, 0],
      [20, 0],
      [0, 20],
      [20, 20],
    ]);
  });

  it('la tinta contrasta con el fondo', () => {
    expect(patternInk('#fffdf4')).toBe('rgba(38, 33, 24, 0.16)');
    expect(patternInk('#16140c')).toBe('rgba(255, 255, 255, 0.16)');
    expect(patternInk('transparent')).toBe('rgba(38, 33, 24, 0.16)');
  });
});
