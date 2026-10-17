import { FONT_CATALOG, fontStack, type CatalogFont } from '../../app/fontCatalog.ts';

/** Escala y conversiones de la tipografía de los documentos con formato (fase 8.2). */

/** Tamaños de A− y A+ (px). Un tamaño intermedio se redondea al paso siguiente. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];
/** Tamaño del texto sin tamaño propio (`.doc-content`). */
export const DEFAULT_FONT_SIZE = 16;

/** Tamaño siguiente (o anterior) de la escala desde un tamaño cualquiera. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZES.find((s) => s > current) ?? FONT_SIZES.at(-1)!;
  return [...FONT_SIZES].reverse().find((s) => s < current) ?? FONT_SIZES[0]!;
}

/** `16px` → 16; null si no es un tamaño en píxeles. */
export function parsePx(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** La fuente del catálogo cuyo `font-family` es este (el que guarda la marca `textStyle`). */
export function catalogFontFor(value: unknown): CatalogFont | null {
  if (typeof value !== 'string') return null;
  return FONT_CATALOG.find((f) => fontStack(f) === value || value.includes(`"${f.name}"`)) ?? null;
}
