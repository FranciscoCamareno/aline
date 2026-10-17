/**
 * Fuentes adicionales de lienzos y documentos (fase 8.2, 17/10/2026): fuentes de Google Fonts
 * empaquetadas por Fontsource (licencias OFL-1.1, y Apache-2.0 en Permanent Marker), servidas
 * desde el propio origen (`public/fonts-extra/`, las copia `scripts/copy-fonts.ts`). El
 * navegador solo descarga una fuente cuando algo la usa, así que ofrecer muchas no ralentiza.
 *
 * Este archivo es la única lista: lo leen el script de copia, los documentos con formato (fuente
 * de la barra de herramientas) y el lienzo (selector de fuentes del motor, `canvasId`).
 * Las métricas salen de las tablas `head` y `hhea` de cada archivo; una prueba unitaria comprueba
 * que siguen coincidiendo al actualizar los paquetes.
 */
export type FontCategory = 'sans' | 'serif' | 'mono' | 'hand' | 'display';

export interface CatalogFont {
  /** Paquete `@fontsource/<id>` y prefijo de sus archivos. */
  id: string;
  /** Nombre de la familia en CSS y en los menús. */
  name: string;
  category: FontCategory;
  /** Hay negrita (700); si no, el navegador la simula. */
  bold: boolean;
  /** Hay cursiva (400 y, si hay negrita, 700). */
  italic: boolean;
  /** Sin latín extendido (solo latín básico); casi todas lo tienen. */
  latinOnly?: boolean;
  /**
   * Identificador de la familia en las escenas del lienzo (`element.fontFamily`). Desde 2001 para
   * no chocar con los del motor (1–9, 100, 1000). Nunca se reutiliza ni se renumera: está en los
   * datos guardados.
   */
  canvasId: number;
  /** Métricas verticales para colocar el texto en el lienzo. */
  metrics: { unitsPerEm: number; ascender: number; descender: number; lineHeight: number };
}

export const FONT_CATALOG: readonly CatalogFont[] = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2001,
    metrics: { unitsPerEm: 2048, ascender: 1984, descender: -494, lineHeight: 1.21 },
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2002,
    metrics: { unitsPerEm: 2048, ascender: 1900, descender: -500, lineHeight: 1.17 },
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2003,
    metrics: { unitsPerEm: 2048, ascender: 2189, descender: -600, lineHeight: 1.36 },
  },
  {
    id: 'lato',
    name: 'Lato',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2004,
    metrics: { unitsPerEm: 2000, ascender: 1974, descender: -426, lineHeight: 1.2 },
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2005,
    metrics: { unitsPerEm: 1000, ascender: 968, descender: -251, lineHeight: 1.22 },
  },
  {
    id: 'work-sans',
    name: 'Work Sans',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2006,
    metrics: { unitsPerEm: 1000, ascender: 930, descender: -243, lineHeight: 1.17 },
  },
  {
    id: 'ibm-plex-sans',
    name: 'IBM Plex Sans',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2007,
    metrics: { unitsPerEm: 1000, ascender: 1025, descender: -275, lineHeight: 1.3 },
  },
  {
    id: 'atkinson-hyperlegible',
    name: 'Atkinson Hyperlegible',
    category: 'sans',
    bold: true,
    italic: true,
    canvasId: 2008,
    metrics: { unitsPerEm: 1000, ascender: 950, descender: -290, lineHeight: 1.24 },
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    category: 'serif',
    bold: true,
    italic: true,
    canvasId: 2009,
    metrics: { unitsPerEm: 2000, ascender: 1968, descender: -546, lineHeight: 1.26 },
  },
  {
    id: 'lora',
    name: 'Lora',
    category: 'serif',
    bold: true,
    italic: true,
    canvasId: 2010,
    metrics: { unitsPerEm: 1000, ascender: 1006, descender: -274, lineHeight: 1.28 },
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    category: 'serif',
    bold: true,
    italic: true,
    canvasId: 2011,
    metrics: { unitsPerEm: 1000, ascender: 1082, descender: -251, lineHeight: 1.33 },
  },
  {
    id: 'eb-garamond',
    name: 'EB Garamond',
    category: 'serif',
    bold: true,
    italic: true,
    canvasId: 2012,
    metrics: { unitsPerEm: 1000, ascender: 1007, descender: -298, lineHeight: 1.31 },
  },
  {
    id: 'libre-baskerville',
    name: 'Libre Baskerville',
    category: 'serif',
    bold: true,
    italic: true,
    canvasId: 2013,
    metrics: { unitsPerEm: 1000, ascender: 970, descender: -270, lineHeight: 1.24 },
  },
  {
    id: 'source-serif-4',
    name: 'Source Serif 4',
    category: 'serif',
    bold: true,
    italic: true,
    canvasId: 2014,
    metrics: { unitsPerEm: 1000, ascender: 1036, descender: -335, lineHeight: 1.37 },
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'mono',
    bold: true,
    italic: true,
    canvasId: 2015,
    metrics: { unitsPerEm: 1000, ascender: 1020, descender: -300, lineHeight: 1.32 },
  },
  {
    id: 'ibm-plex-mono',
    name: 'IBM Plex Mono',
    category: 'mono',
    bold: true,
    italic: true,
    canvasId: 2016,
    metrics: { unitsPerEm: 1000, ascender: 1025, descender: -275, lineHeight: 1.3 },
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    category: 'mono',
    bold: true,
    italic: false,
    canvasId: 2017,
    metrics: { unitsPerEm: 2000, ascender: 1980, descender: -644, lineHeight: 1.31 },
  },
  {
    id: 'caveat',
    name: 'Caveat',
    category: 'hand',
    bold: true,
    italic: false,
    canvasId: 2018,
    metrics: { unitsPerEm: 1000, ascender: 960, descender: -300, lineHeight: 1.26 },
  },
  {
    id: 'patrick-hand',
    name: 'Patrick Hand',
    category: 'hand',
    bold: false,
    italic: false,
    canvasId: 2019,
    metrics: { unitsPerEm: 1000, ascender: 1042, descender: -312, lineHeight: 1.35 },
  },
  {
    id: 'kalam',
    name: 'Kalam',
    category: 'hand',
    bold: true,
    italic: false,
    canvasId: 2020,
    metrics: { unitsPerEm: 1000, ascender: 1063, descender: -531, lineHeight: 1.5 },
  },
  {
    id: 'architects-daughter',
    name: 'Architects Daughter',
    category: 'hand',
    bold: false,
    italic: false,
    canvasId: 2021,
    metrics: { unitsPerEm: 1024, ascender: 1010, descender: -413, lineHeight: 1.39 },
  },
  {
    id: 'permanent-marker',
    name: 'Permanent Marker',
    category: 'display',
    bold: false,
    italic: false,
    latinOnly: true,
    canvasId: 2022,
    metrics: { unitsPerEm: 1024, ascender: 1136, descender: -325, lineHeight: 1.46 },
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'display',
    bold: false,
    italic: false,
    canvasId: 2023,
    metrics: { unitsPerEm: 1000, ascender: 900, descender: -300, lineHeight: 1.2 },
  },
  {
    id: 'pacifico',
    name: 'Pacifico',
    category: 'display',
    bold: false,
    italic: false,
    canvasId: 2024,
    metrics: { unitsPerEm: 1000, ascender: 1303, descender: -453, lineHeight: 1.5 },
  },
];

/** Subconjuntos que se sirven: latín y latín extendido (español, portugués, etc.). */
export const FONT_SUBSETS = {
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
} as const;

export type FontSubset = keyof typeof FONT_SUBSETS;

export interface FontFile {
  subset: FontSubset;
  weight: 400 | 700;
  style: 'normal' | 'italic';
  /** Nombre del archivo en `@fontsource/<id>/files/` y en `public/fonts-extra/<id>/`. */
  file: string;
}

/** Archivos de una fuente: cada subconjunto, en regular y, si los hay, negrita y cursivas. */
export function fontFiles(font: CatalogFont): FontFile[] {
  const files: FontFile[] = [];
  const weights: Array<400 | 700> = font.bold ? [400, 700] : [400];
  const styles: Array<'normal' | 'italic'> = font.italic ? ['normal', 'italic'] : ['normal'];
  const subsets: FontSubset[] = font.latinOnly ? ['latin'] : ['latin', 'latin-ext'];
  for (const subset of subsets) {
    for (const weight of weights) {
      for (const style of styles) {
        files.push({
          subset,
          weight,
          style,
          file: `${font.id}-${subset}-${weight}-${style}.woff2`,
        });
      }
    }
  }
  return files;
}

/** Ruta pública de un archivo de fuente (mismo origen). */
export function fontUrl(font: CatalogFont, file: FontFile): string {
  return `/fonts-extra/${font.id}/${file.file}`;
}

/** Familia CSS con su respaldo genérico, para `font-family`. */
export function fontStack(font: CatalogFont): string {
  const generic =
    font.category === 'serif' ? 'serif' : font.category === 'mono' ? 'monospace' : 'sans-serif';
  return `"${font.name}", ${generic}`;
}
