/**
 * Herramientas de la barra propia del lienzo (docs/DESIGN.md §7.1–7.2). Cada una es un objeto
 * ilustrado (48×64, `brand/icons/tools[-dark]/`) y un glifo de línea (`brand/icons/glyphs/`).
 * Los atajos son los del motor, que los sigue atendiendo; la nota adhesiva (N) y los stickers
 * (B) son propios. Mayús+S, la propuesta del diseño para los stickers, es el cuentagotas del motor.
 */
export type EngineTool =
  | 'selection'
  | 'hand'
  | 'freedraw'
  | 'text'
  | 'eraser'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'frame'
  | 'laser'
  | 'image';

export type ShapeTool = 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line';

export interface ToolDef {
  /** Herramienta del motor, o una acción propia. */
  id: EngineTool | 'sticky' | 'sticker' | 'mermaid';
  /** Nombre del archivo del objeto y del glifo. */
  art: string;
  /** Clave de traducción del nombre (bajo `toolbar.`). */
  label: string;
  shortcut: string | null;
}

export const SHAPES: readonly (ToolDef & { id: ShapeTool })[] = [
  { id: 'rectangle', art: 'rectangulo', label: 'rectangle', shortcut: 'R' },
  { id: 'diamond', art: 'rombo', label: 'diamond', shortcut: 'D' },
  { id: 'ellipse', art: 'elipse', label: 'ellipse', shortcut: 'O' },
  { id: 'arrow', art: 'flecha', label: 'arrow', shortcut: 'A' },
  { id: 'line', art: 'linea', label: 'line', shortcut: 'L' },
];

/**
 * Barra principal, entre el candado y la caja: selección, mano, lápiz, texto, nota, stickers,
 * formas, borrador.
 */
export const BEFORE_SHAPES: readonly ToolDef[] = [
  { id: 'selection', art: 'seleccion', label: 'selection', shortcut: 'V' },
  { id: 'hand', art: 'mano', label: 'hand', shortcut: 'H' },
  { id: 'freedraw', art: 'lapiz', label: 'freedraw', shortcut: 'P' },
  { id: 'text', art: 'texto', label: 'text', shortcut: 'T' },
  { id: 'sticky', art: 'nota', label: 'sticky', shortcut: 'N' },
  { id: 'sticker', art: 'sticker', label: 'sticker', shortcut: 'B' },
];
export const AFTER_SHAPES: readonly ToolDef[] = [
  { id: 'eraser', art: 'borrador', label: 'eraser', shortcut: 'E' },
];

/**
 * Panel secundario: inserción y, tras el divisor, «Generar». «Incrustar web» no se ofrece: el
 * contenido web incrustado se descarta por privacidad (diseño §13, RNF-05).
 */
export const SECONDARY: readonly ToolDef[] = [
  { id: 'frame', art: 'marco', label: 'frame', shortcut: 'F' },
  { id: 'laser', art: 'laser', label: 'laser', shortcut: 'K' },
  { id: 'image', art: 'imagen', label: 'image', shortcut: '9' },
];
export const GENERATE: readonly ToolDef[] = [
  { id: 'mermaid', art: 'diagrama', label: 'mermaid', shortcut: null },
];

export const isShape = (tool: string): tool is ShapeTool => SHAPES.some((s) => s.id === tool);
