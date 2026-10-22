import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWoff2Metrics } from '../../scripts/font-metadata.ts';
import { FONT_CATALOG, fontFiles, fontStack } from '../../src/app/fontCatalog.ts';
import {
  catalogFontFor,
  FONT_SIZES,
  parsePx,
  stepFontSize,
} from '../../src/features/docs/typography.ts';

const fontsource = (id: string, file: string) =>
  join(process.cwd(), 'node_modules', '@fontsource', id, 'files', file);

describe('catálogo de fuentes (fase 8.2)', () => {
  it('ids y nombres únicos; los del lienzo desde 2001 y sin repetir', () => {
    expect(new Set(FONT_CATALOG.map((f) => f.id)).size).toBe(FONT_CATALOG.length);
    expect(new Set(FONT_CATALOG.map((f) => f.name)).size).toBe(FONT_CATALOG.length);
    const ids = FONT_CATALOG.map((f) => f.canvasId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(2001);
  });

  it('cada archivo existe en su paquete y las métricas coinciden con el archivo', () => {
    for (const font of FONT_CATALOG) {
      for (const { file } of fontFiles(font))
        expect(existsSync(fontsource(font.id, file))).toBe(true);
      const m = readWoff2Metrics(fontsource(font.id, `${font.id}-latin-400-normal.woff2`));
      expect({ font: font.id, ...font.metrics, lineHeight: 0 }).toEqual({
        font: font.id,
        unitsPerEm: m.unitsPerEm,
        ascender: m.ascender,
        descender: m.descender,
        lineHeight: 0,
      });
      expect(font.metrics.lineHeight).toBeGreaterThanOrEqual(1.15);
      expect(font.metrics.lineHeight).toBeLessThanOrEqual(1.5);
    }
  });

  it('el parche del motor está aplicado en sus dos compilaciones', () => {
    const patch = readFileSync(
      join(process.cwd(), 'patches', '@excalidraw__excalidraw@0.18.1.patch'),
      'utf8',
    );
    const files = [...patch.matchAll(/^\+\+\+ b\/(\S+)$/gm)].map((m) => m[1]!);
    const code = (file: string) =>
      readFileSync(join(process.cwd(), 'node_modules', '@excalidraw', 'excalidraw', file), 'utf8');
    // Fuentes extra y sin CDN de respaldo (plan 8.2, 9.1): el fragmento con las fuentes.
    const fonts = files.filter((f) => code(f).includes('__alineExtraFonts'));
    expect(fonts.map((f) => f.split('/')[1])).toEqual(['dev', 'prod']);
    for (const file of fonts) expect(code(file)).toMatch(/!urls\.length|r\.length\|\|r\.push/);
    // pagehide en lugar de unload (Chrome lo retira): el índice de cada compilación.
    const pages = files.filter((f) => f.endsWith('/index.js'));
    expect(pages.map((f) => f.split('/')[1])).toEqual(['dev', 'prod']);
    for (const file of pages) {
      expect(code(file)).not.toMatch(/\(window, ?"unload"/);
      expect(code(file)).toMatch(/\(window, ?"pagehide", ?this\.onUnload/);
    }
    expect(files).toHaveLength(4);
  });
});

describe('tamaño de letra de los documentos con formato', () => {
  it('A+ y A− siguen la escala, también desde un tamaño intermedio', () => {
    expect(stepFontSize(16, 1)).toBe(18);
    expect(stepFontSize(16, -1)).toBe(14);
    expect(stepFontSize(15, 1)).toBe(16);
    expect(stepFontSize(15, -1)).toBe(14);
    expect(stepFontSize(FONT_SIZES.at(-1)!, 1)).toBe(FONT_SIZES.at(-1));
    expect(stepFontSize(FONT_SIZES[0]!, -1)).toBe(FONT_SIZES[0]);
  });

  it('lee tamaños en píxeles y reconoce las fuentes del catálogo', () => {
    expect(parsePx('18px')).toBe(18);
    expect(parsePx('1.2em')).toBeNull();
    expect(parsePx(undefined)).toBeNull();
    const lora = FONT_CATALOG.find((f) => f.id === 'lora')!;
    expect(catalogFontFor(fontStack(lora))).toBe(lora);
    expect(catalogFontFor('"Lora", serif')).toBe(lora);
    expect(catalogFontFor('Comic Sans MS')).toBeNull();
  });
});
