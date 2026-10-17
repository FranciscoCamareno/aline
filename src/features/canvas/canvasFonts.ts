import { FONT_FAMILY } from '@excalidraw/excalidraw';
import { FONT_CATALOG, FONT_SUBSETS, fontFiles, fontUrl } from '../../app/fontCatalog.ts';

/** Lo que lee el parche del motor (`patches/@excalidraw__excalidraw@*.patch`) en `Fonts.init`. */
interface ExtraFont {
  id: number;
  family: string;
  metadata: { metrics: (typeof FONT_CATALOG)[number]['metrics'] };
  faces: Array<{ uri: string; descriptors: { unicodeRange: string } }>;
}

declare global {
  var __alineExtraFonts: ExtraFont[] | undefined;
}

/**
 * Añade las fuentes del catálogo al lienzo (fase 8.2): el selector de fuentes del motor, con su
 * búsqueda, las muestra junto a las suyas. El motor no tiene una API pública para esto: su tabla
 * de familias (`FONT_FAMILY`, exportada) se amplía aquí y su registro de fuentes lee
 * `globalThis.__alineExtraFonts` gracias a un parche de cinco líneas en `Fonts.init`. Una prueba
 * e2e falla si una actualización del motor lo rompe. Debe llamarse antes de montar el lienzo.
 *
 * El texto del lienzo usa un solo peso (400 normal); las URL son absolutas y del mismo origen,
 * así el motor no recurre a su CDN de respaldo.
 */
export function registerCanvasFonts(): void {
  const families = FONT_FAMILY as Record<string, number>;
  globalThis.__alineExtraFonts = FONT_CATALOG.map((font) => {
    families[font.name] = font.canvasId;
    return {
      id: font.canvasId,
      family: font.name,
      metadata: { metrics: font.metrics },
      faces: fontFiles(font)
        .filter((f) => f.weight === 400 && f.style === 'normal')
        .map((f) => ({
          uri: new URL(
            `${import.meta.env.BASE_URL.replace(/\/$/, '')}${fontUrl(font, f)}`,
            location.origin,
          ).href,
          descriptors: { unicodeRange: FONT_SUBSETS[f.subset] },
        })),
    };
  });
}
