import { FONT_CATALOG, FONT_SUBSETS, fontFiles, fontUrl } from './fontCatalog.ts';

/**
 * Declara las fuentes del catálogo en el documento con la API `FontFace` (sin estilos en línea,
 * compatible con la CSP). Declararlas no descarga nada: el navegador baja cada archivo la primera
 * vez que un texto usa esa fuente, ese peso y ese rango de caracteres.
 */
export function installFontFaces(): void {
  if (typeof FontFace === 'undefined' || !('fonts' in document)) return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  for (const font of FONT_CATALOG) {
    for (const file of fontFiles(font)) {
      document.fonts.add(
        new FontFace(font.name, `url(${base}${fontUrl(font, file)}) format("woff2")`, {
          style: file.style,
          weight: String(file.weight),
          unicodeRange: FONT_SUBSETS[file.subset],
          display: 'swap',
        }),
      );
    }
  }
}
