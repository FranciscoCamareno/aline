/**
 * Esquemas de color (docs/DESIGN.md §2.5, `brand/themes/`): 8 esquemas en 4 pares claro ↔ oscuro.
 * Los tokens de cada uno están en `styles.css` bajo `:root[data-scheme='…']`; aquí, lo que
 * necesita el código: modo, par, logotipo, miniatura y el fondo del lienzo.
 */
export const LIGHT_SCHEMES = ['papel', 'blanco', 'bruma', 'salvia'] as const;
export const DARK_SCHEMES = ['noche', 'negro', 'marea', 'bosque'] as const;
export type LightScheme = (typeof LIGHT_SCHEMES)[number];
export type DarkScheme = (typeof DARK_SCHEMES)[number];
export type Scheme = LightScheme | DarkScheme;

export const DEFAULT_LIGHT_SCHEME: LightScheme = 'papel';
export const DEFAULT_DARK_SCHEME: DarkScheme = 'noche';

/** Par de cada esquema: el lienzo oscuro de un par es el filtro del motor sobre el claro. */
export const SCHEME_PAIR: Record<Scheme, Scheme> = {
  papel: 'noche',
  noche: 'papel',
  blanco: 'negro',
  negro: 'blanco',
  bruma: 'marea',
  marea: 'bruma',
  salvia: 'bosque',
  bosque: 'salvia',
};

/**
 * Fondo de lienzo (claro, sin filtrar) de cada esquema. En los oscuros es el del esquema claro de
 * su par: el filtro del motor lo convierte en el lienzo oscuro del esquema (`--bg-canvas`).
 */
const LIGHT_CANVAS: Record<LightScheme, string> = {
  papel: '#FFFDF4',
  blanco: '#FFFFFF',
  bruma: '#F6FAFA',
  salvia: '#F8FAF3',
};

export function isLightScheme(value: unknown): value is LightScheme {
  return (LIGHT_SCHEMES as readonly unknown[]).includes(value);
}

export function isDarkScheme(value: unknown): value is DarkScheme {
  return (DARK_SCHEMES as readonly unknown[]).includes(value);
}

export function schemeCanvas(scheme: Scheme): string {
  return LIGHT_CANVAS[isLightScheme(scheme) ? scheme : (SCHEME_PAIR[scheme] as LightScheme)];
}

/**
 * Fondo que se pinta en el lienzo (DESIGN.md §2.5). Un lienzo con el fondo de algún esquema (el
 * de papel es el de los lienzos nuevos) se ve con el del esquema activo; uno con otro color
 * elegido a propósito conserva el suyo. Es solo presentación: lo guardado no cambia.
 */
export function displayedCanvasBackground(stored: string | undefined, scheme: Scheme): string {
  const value = (stored ?? '').toUpperCase();
  const isSchemeDefault = value === '' || Object.values(LIGHT_CANVAS).includes(value);
  return isSchemeDefault ? schemeCanvas(scheme) : (stored ?? schemeCanvas(scheme));
}

/** Color de la barra del navegador y de la PWA instalada: el panel de cada esquema. */
export const SCHEME_PANEL: Record<Scheme, string> = {
  papel: '#F8F2E1',
  blanco: '#FFFFFF',
  bruma: '#E6F0F1',
  salvia: '#EBF0E2',
  noche: '#24211B',
  negro: '#000000',
  marea: '#162428',
  bosque: '#192219',
};

const logos = import.meta.glob<string>('../../brand/themes/*/aline-logo.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const previews = import.meta.glob<string>('../../brand/themes/*/preview.png', {
  query: '?url',
  import: 'default',
  eager: true,
});

function assetFor(files: Record<string, string>, scheme: Scheme): string {
  const url = files[Object.keys(files).find((path) => path.includes(`/${scheme}/`)) ?? ''];
  if (!url) throw new Error(`Recurso del esquema no encontrado: ${scheme}`);
  return url;
}

/** Logotipo del esquema: letras en su tinta y el resaltador de su tema. */
export function schemeLogo(scheme: Scheme): string {
  return assetFor(logos, scheme);
}

/** Miniatura del esquema para el selector de Preferencias. */
export function schemePreview(scheme: Scheme): string {
  return assetFor(previews, scheme);
}
