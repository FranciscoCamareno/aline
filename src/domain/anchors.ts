import type { LinkFragment, TextSelector } from './links.ts';

/**
 * Anclas de texto (diseño §10): un enlace puede apuntar a un fragmento de una nota o documento
 * con una cita textual y, en los documentos con formato, también con el id de su bloque. Las
 * citas se toman y se buscan sobre el texto **mostrado** (sin marcas de Markdown), de modo que
 * una misma cita vale en CodeMirror, Milkdown, la copia legible y el índice. Nada de esto
 * modifica el documento de destino.
 */

/** Bloque de texto (párrafo, título…) dentro del texto mostrado; `id` = ancla del bloque. */
export interface TextBlock {
  id: string | null;
  from: number;
  to: number;
}

/**
 * Tramo del texto mostrado y su posición en el origen: desplazamiento en el Markdown fuente
 * (notas) o posición de ProseMirror (documentos con formato). Si los dos tramos no miden lo
 * mismo (escapes, entidades), dentro del tramo la correspondencia es aproximada.
 */
export interface TextSegment {
  from: number;
  to: number;
  sourceFrom: number;
  sourceTo: number;
}

export interface TextProjection {
  /** Texto mostrado: bloques separados por `\n`. */
  text: string;
  blocks: TextBlock[];
  segments: TextSegment[];
}

/** Construye una proyección: los bloques se separan con un salto de línea. */
export class ProjectionBuilder {
  private text = '';
  private readonly blocks: TextBlock[] = [];
  private readonly segments: TextSegment[] = [];
  private open: TextBlock | null = null;

  startBlock(id: string | null): void {
    this.endBlock();
    if (this.text) this.text += '\n';
    this.open = { id, from: this.text.length, to: this.text.length };
  }

  /** Texto dentro del bloque abierto; sin posición de origen si no la tiene (separadores). */
  append(value: string, sourceFrom?: number, sourceTo?: number): void {
    if (!value) return;
    if (!this.open) this.startBlock(null);
    const from = this.text.length;
    this.text += value;
    if (sourceFrom !== undefined && sourceTo !== undefined) {
      this.segments.push({ from, to: this.text.length, sourceFrom, sourceTo });
    }
  }

  endBlock(): void {
    if (!this.open) return;
    this.open.to = this.text.length;
    this.blocks.push(this.open);
    this.open = null;
  }

  build(): TextProjection {
    this.endBlock();
    return { text: this.text, blocks: this.blocks, segments: this.segments };
  }
}

/**
 * Posición de origen de un desplazamiento del texto mostrado. Entre tramos (separadores de
 * bloque) se usa el comienzo del siguiente (`start`) o el final del anterior (`end`).
 */
export function sourceOffset(
  projection: TextProjection,
  offset: number,
  bias: 'start' | 'end',
): number | null {
  const { segments } = projection;
  if (!segments.length) return null;
  // En el borde entre dos tramos, un comienzo pertenece al siguiente y un final al anterior.
  const inside = segments.find((s) =>
    bias === 'start' ? s.from <= offset && offset < s.to : s.from < offset && offset <= s.to,
  );
  if (inside) {
    if (offset === inside.from) return inside.sourceFrom;
    if (offset === inside.to) return inside.sourceTo;
    return Math.min(inside.sourceFrom + (offset - inside.from), inside.sourceTo);
  }
  if (bias === 'start') {
    const next = segments.find((s) => s.from >= offset);
    return next ? next.sourceFrom : segments.at(-1)!.sourceTo;
  }
  const previous = segments.findLast((s) => s.to <= offset);
  return previous ? previous.sourceTo : segments[0]!.sourceFrom;
}

// --- Comparación tolerante: sin mayúsculas, sin diacríticos y con los espacios colapsados ---

interface Folded {
  text: string;
  /** Desplazamiento original de cada carácter plegado; el último elemento = longitud original. */
  map: number[];
}

function fold(value: string): Folded {
  let text = '';
  const map: number[] = [];
  let offset = 0;
  let lastSpace = false;
  for (const char of value) {
    if (/\s/u.test(char)) {
      if (!lastSpace) {
        text += ' ';
        map.push(offset);
      }
      lastSpace = true;
    } else {
      const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      for (const c of folded) {
        text += c;
        for (let i = 0; i < c.length; i++) map.push(offset);
      }
      lastSpace = false;
    }
    offset += char.length;
  }
  map.push(offset);
  return { text, map };
}

function foldPart(value: string): string {
  return fold(value).text.trim();
}

function collapse(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** Citas de hasta esta longitud se guardan enteras; las más largas, comienzo y final. */
const MAX_EXACT = 200;
const EDGE = 60;
const CONTEXT = 30;

/** Las primeras palabras de un texto, hasta `max` caracteres sin cortar palabras si se puede. */
function headWords(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.lastIndexOf(' ', max);
  return value.slice(0, cut > 0 ? cut : max);
}

function tailWords(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.indexOf(' ', value.length - max);
  return value.slice(cut >= 0 && cut < value.length - 1 ? cut + 1 : value.length - max);
}

/** Selector para el rango `[from, to)` del texto mostrado; null si la selección no tiene texto. */
export function textSelectorFor(text: string, from: number, to: number): TextSelector | null {
  const exact = collapse(text.slice(from, to));
  if (!exact) return null;
  const long = exact.length > MAX_EXACT;
  return {
    prefix: tailWords(collapse(text.slice(Math.max(0, from - 2 * CONTEXT), from)), CONTEXT),
    start: long ? headWords(exact, EDGE) : exact,
    end: long ? tailWords(exact, EDGE) : '',
    suffix: headWords(collapse(text.slice(to, to + 2 * CONTEXT)), CONTEXT),
  };
}

export interface TextMatch {
  from: number;
  to: number;
  /** El prefijo y el sufijo también coinciden (o no había). */
  contextMatched: boolean;
}

const MAX_CANDIDATES = 1000;

/**
 * Busca una cita en un texto. Entre varias apariciones gana la que más contexto comparte; a
 * igualdad, la primera. Null si la cita ya no está.
 */
export function findTextSelector(text: string, selector: TextSelector): TextMatch | null {
  const haystack = fold(text);
  const start = foldPart(selector.start);
  const end = foldPart(selector.end);
  const prefix = foldPart(selector.prefix);
  const suffix = foldPart(selector.suffix);
  if (!start) return null;
  let best: { from: number; to: number; score: number } | null = null;
  let at = haystack.text.indexOf(start);
  for (let n = 0; at >= 0 && n < MAX_CANDIDATES; n++) {
    let to = at + start.length;
    if (end) {
      const endAt = haystack.text.indexOf(end, to);
      if (endAt < 0) break; // tampoco habrá final después de una aparición posterior
      to = endAt + end.length;
    }
    const before = haystack.text.slice(0, at).trimEnd();
    const after = haystack.text.slice(to).trimStart();
    const score =
      (prefix && before.endsWith(prefix) ? 1 : 0) + (suffix && after.startsWith(suffix) ? 1 : 0);
    if (!best || score > best.score) best = { from: at, to, score };
    at = haystack.text.indexOf(start, at + 1);
  }
  if (!best) return null;
  const wanted = (prefix ? 1 : 0) + (suffix ? 1 : 0);
  return {
    from: haystack.map[best.from]!,
    to: haystack.map[best.to]!,
    contextMatched: best.score === wanted,
  };
}

export type AnchorResolution =
  /** El fragmento está (la cita, o el bloque si el enlace solo nombra un bloque). */
  | { status: 'found'; from: number; to: number }
  /** El bloque sigue, pero la cita ya no aparece: se ofrece el bloque entero. */
  | { status: 'approximate'; from: number; to: number }
  /** Ni la cita ni el bloque: se abre el documento con un aviso. */
  | { status: 'lost' };

/**
 * Resuelve el ancla de texto de un enlace sobre un documento proyectado. Null si el enlace no
 * apunta a un fragmento de texto (documento entero, elemento de lienzo o evento).
 */
export function resolveAnchor(
  projection: TextProjection,
  fragment: Pick<LinkFragment, 'blockId' | 'text'>,
): AnchorResolution | null {
  const { blockId, text } = fragment;
  if (!blockId && !text) return null;
  const block = blockId ? projection.blocks.find((b) => b.id === blockId) : undefined;
  if (text) {
    if (block) {
      const inBlock = findTextSelector(projection.text.slice(block.from, block.to), text);
      if (inBlock) {
        return { status: 'found', from: block.from + inBlock.from, to: block.from + inBlock.to };
      }
    }
    // Sin bloque, o la cita salió de él (se movió de párrafo): se busca en todo el documento.
    const anywhere = findTextSelector(projection.text, text);
    if (anywhere) return { status: 'found', from: anywhere.from, to: anywhere.to };
    return block ? { status: 'approximate', from: block.from, to: block.to } : { status: 'lost' };
  }
  return block ? { status: 'found', from: block.from, to: block.to } : { status: 'lost' };
}

/**
 * Inversa de `sourceOffset`: desplazamiento en el texto mostrado de una posición de origen. Una
 * posición fuera de los tramos (marcas de Markdown, separadores) va al tramo siguiente
 * (`start`) o al anterior (`end`).
 */
export function projectionOffset(
  projection: TextProjection,
  source: number,
  bias: 'start' | 'end',
): number {
  const { segments } = projection;
  const inside = segments.find((s) =>
    bias === 'start'
      ? s.sourceFrom <= source && source < s.sourceTo
      : s.sourceFrom < source && source <= s.sourceTo,
  );
  if (inside) return Math.min(inside.from + (source - inside.sourceFrom), inside.to);
  if (bias === 'start') {
    const next = segments.find((s) => s.sourceFrom >= source);
    return next ? next.from : projection.text.length;
  }
  const previous = segments.findLast((s) => s.sourceTo <= source);
  return previous ? previous.to : 0;
}

/**
 * Cita para una selección del texto mostrado. Sin selección, cita el bloque donde está el
 * cursor. Null si no hay texto que citar.
 */
export function selectorForRange(
  projection: TextProjection,
  from: number,
  to: number,
): TextSelector | null {
  if (from < to) return textSelectorFor(projection.text, from, to);
  const block = projection.blocks.find((b) => b.from <= from && from <= b.to);
  return block ? textSelectorFor(projection.text, block.from, block.to) : null;
}

/** Texto corto que representa una cita (texto de un enlace, aviso de «copiado»). */
export function quoteLabel(selector: TextSelector): string {
  return selector.end ? `${selector.start}…` : selector.start;
}
