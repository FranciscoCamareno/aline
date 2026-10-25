/**
 * Estilo del fondo de un lienzo (plan 10.9): liso, puntos, renglones o cuadrícula. Es de cada
 * lienzo y se guarda en su sidecar (`background.pattern`, formato §2.5); el color del fondo
 * sigue siendo el de la escena. El motor no dibuja estos patrones: la vista los pinta en una capa
 * propia detrás del lienzo y la exportación, si se pide, en la imagen.
 */
export const CANVAS_PATTERNS = ['plain', 'dots', 'lines', 'grid'] as const;
export type CanvasPattern = (typeof CANVAS_PATTERNS)[number];

/** Separación del patrón en unidades de la escena (la cuadrícula, como la del motor). */
export const PATTERN_STEP: Record<Exclude<CanvasPattern, 'plain'>, number> = {
  dots: 20,
  lines: 32,
  grid: 20,
};
/** Radio de los puntos y grosor de las líneas, en unidades de la escena. */
export const DOT_RADIUS = 1.4;
export const LINE_WIDTH = 1;

/** Patrón guardado; uno desconocido (de una versión posterior) se muestra liso. */
export function readPattern(value: unknown): CanvasPattern {
  return CANVAS_PATTERNS.includes(value as CanvasPattern) ? (value as CanvasPattern) : 'plain';
}

/** Luminancia relativa de un color `#rgb` o `#rrggbb`; null si no se entiende. */
function luminance(color: string): number | null {
  const hex = color.trim().replace(/^#/, '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const channel = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Tinta del patrón sobre un fondo: oscura y suave sobre claro, clara sobre oscuro. */
export function patternInk(background: string): string {
  const l = luminance(background);
  return l !== null && l < 0.35 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(38, 33, 24, 0.16)';
}

export interface PatternMarks {
  /** Coordenadas `y` de las líneas horizontales (renglones y cuadrícula). */
  rows: number[];
  /** Coordenadas `x` de las verticales (cuadrícula). */
  columns: number[];
  /** Centros de los puntos. */
  dots: Array<[number, number]>;
}

/**
 * Marcas del patrón dentro de un rectángulo de la escena, alineadas con el origen de la escena
 * (así coinciden con lo que se ve en el lienzo).
 */
export function patternMarks(
  pattern: CanvasPattern,
  rect: { x: number; y: number; width: number; height: number },
): PatternMarks {
  const marks: PatternMarks = { rows: [], columns: [], dots: [] };
  if (pattern === 'plain') return marks;
  const step = PATTERN_STEP[pattern];
  // `|| 0` evita un -0 al empezar por debajo del origen.
  const from = (start: number) => Math.ceil(start / step) * step || 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = from(rect.x); x <= rect.x + rect.width; x += step) xs.push(x);
  for (let y = from(rect.y); y <= rect.y + rect.height; y += step) ys.push(y);
  if (pattern === 'dots') {
    for (const y of ys) for (const x of xs) marks.dots.push([x, y]);
  } else {
    marks.rows = ys;
    if (pattern === 'grid') marks.columns = xs;
  }
  return marks;
}
