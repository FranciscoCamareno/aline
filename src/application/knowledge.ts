import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { ProjectionBuilder, type TextBlock, type TextProjection } from '../domain/anchors.ts';
import { parseCalendar } from '../domain/calendar.ts';
import { parseCanvasExtensions } from '../domain/compat.ts';
import {
  parseInternalLink,
  parseLinkFragment,
  type InternalTarget,
  type TextSelector,
} from '../domain/links.ts';
import { docTabs, parseRichDoc, richDocProjection, type RichNode } from '../domain/richDoc.ts';

/**
 * Extracción de enlaces y texto indexable (diseño §10): se hace sobre el AST de Markdown, no con
 * expresiones regulares sobre el texto completo, para respetar código, escapes y enlaces.
 * Los índices que se construyen con esto son derivados y reconstruibles.
 */
export interface ExtractedLink {
  /**
   * Origen dentro del documento: elemento del lienzo, evento del calendario o bloque anclado de
   * un documento con formato; null en notas.
   */
  sourceElementId: string | null;
  /** Destino por UUID (enlace Markdown o de elemento); null en un [[Título]] sin resolver. */
  targetDocumentId: string | null;
  targetElementId: string | null;
  /** Ancla de destino (formato §2.3.1): bloque, evento o cita. */
  targetBlockId: string | null;
  targetEventId: string | null;
  targetQuote: TextSelector | null;
  kind: 'markdown' | 'wiki' | 'element' | 'rich' | 'event';
  /** Texto visible del enlace o título de un [[Título]]. */
  label: string;
  /** Frase de origen alrededor del enlace (el párrafo, recortado), para los backlinks. */
  context: string;
}

export interface SearchElement {
  elementId: string;
  text: string;
}

export interface Extracted {
  links: ExtractedLink[];
  /**
   * Texto plano para la búsqueda de texto completo. En notas y documentos es el texto mostrado
   * (`TextProjection.text`), sobre el que se resuelven las citas de los enlaces.
   */
  text: string;
  /** Lienzos y calendarios: texto por elemento o evento para localizar la coincidencia (§10.1). */
  elements: SearchElement[];
  /** Documentos con formato: bloques anclados dentro de `text` (destino de `#b=`). */
  blocks?: TextBlock[];
  /** Lienzos: ids de todos los elementos vivos, para saber si sigue el destino de `#<id>`. */
  elementIds?: string[];
}

const CONTEXT_MAX = 160;

function context(text: string): string {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > CONTEXT_MAX ? `${value.slice(0, CONTEXT_MAX)}…` : value;
}

/** Campos de destino de un enlace interno ya analizado. */
function targetFields(target: InternalTarget) {
  return {
    targetDocumentId: target.documentId,
    targetElementId: target.elementId,
    targetBlockId: target.blockId,
    targetEventId: target.eventId,
    targetQuote: target.text,
  };
}

const NO_TARGET = {
  targetDocumentId: null,
  targetElementId: null,
  targetBlockId: null,
  targetEventId: null,
  targetQuote: null,
};

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

const WIKI = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;
const parser = unified().use(remarkParse).use(remarkGfm);

function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(nodeText).join('');
}

export function extractNote(body: string): Extracted {
  const links: ExtractedLink[] = [];
  /** Bloque (párrafo, título…) que contiene el nodo actual: el contexto de sus enlaces. */
  let block = '';
  const walk = (node: MdNode, inCode: boolean) => {
    if (MD_BLOCKS.has(node.type)) block = context(nodeText(node));
    if (node.type === 'link' && node.url) {
      const target = parseInternalLink(node.url);
      if (target) {
        links.push({
          sourceElementId: null,
          ...targetFields(target),
          kind: 'markdown',
          label: nodeText(node),
          context: block,
        });
      }
    }
    if (node.type === 'text' && node.value && !inCode) {
      for (const match of node.value.matchAll(WIKI)) {
        links.push({
          sourceElementId: null,
          ...NO_TARGET,
          kind: 'wiki',
          label: match[1]!.normalize('NFC').trim(),
          context: block,
        });
      }
    }
    const code = inCode || node.type === 'code' || node.type === 'inlineCode';
    for (const child of node.children ?? []) walk(child, code);
  };
  walk(parser.parse(body) as MdNode, false);
  return { links, text: markdownProjection(body).text, elements: [] };
}

/**
 * Documentos con formato: enlaces internos de las marcas `link` (una racha de texto con el mismo
 * destino es un solo enlace), texto mostrado y bloques anclados.
 */
export function extractRichDoc(bodyJson: string | null): Extracted {
  let value: unknown = null;
  try {
    value = JSON.parse(bodyJson ?? 'null');
  } catch {
    // Contenido ilegible: ya se trata como inválido al abrir el documento.
  }
  const { doc } = parseRichDoc(value);
  const projection = richDocProjection(doc);
  const links: ExtractedLink[] = [];
  const hrefOf = (node: RichNode) => {
    const href = node.marks?.find((m) => m.type === 'link')?.attrs?.['href'];
    return typeof href === 'string' ? href : null;
  };
  const walk = (node: RichNode) => {
    const children = node.content ?? [];
    if (!children.some((c) => c.type === 'text')) {
      children.forEach(walk);
      return;
    }
    const anchor = node.attrs?.['anchor'];
    const source = typeof anchor === 'string' && anchor ? anchor : null;
    const blockText = context(children.map((c) => c.text ?? '').join(''));
    let href: string | null = null;
    let label = '';
    const close = () => {
      const target = href ? parseInternalLink(href) : null;
      if (target) {
        links.push({
          sourceElementId: source,
          ...targetFields(target),
          kind: 'rich',
          label,
          context: blockText,
        });
      }
      href = null;
      label = '';
    };
    for (const child of children) {
      const current = child.type === 'text' ? hrefOf(child) : null;
      if (href !== null && current === href) {
        label += child.text ?? '';
        continue;
      }
      close();
      if (current) {
        href = current;
        label = child.text ?? '';
      }
    }
    close();
  };
  // Todas las pestañas.
  for (const tab of docTabs(doc)) walk(tab.content);
  return {
    links,
    text: projection.text,
    elements: [],
    blocks: projection.blocks.filter((b) => b.id !== null),
  };
}

/** Calendarios: títulos de los eventos y sus enlaces (el evento es el origen). */
export function extractCalendar(bodyJson: string | null): Extracted {
  let value: unknown = null;
  try {
    value = JSON.parse(bodyJson ?? 'null');
  } catch {
    // Contenido ilegible: ya se trata como inválido al abrir el calendario.
  }
  const { events } = parseCalendar(value).calendar;
  const links: ExtractedLink[] = [];
  for (const event of events) {
    for (const link of event.links ?? []) {
      const target = parseInternalLink(link.url);
      if (!target) continue;
      links.push({
        sourceElementId: event.id,
        ...targetFields(target),
        kind: 'event',
        label: link.label,
        context: context(event.title),
      });
    }
  }
  const elements = events.map((e) => ({ elementId: e.id, text: e.title }));
  return { links, text: elements.map((e) => e.text).join('\n'), elements };
}

/** Bloques del Markdown que forman un bloque del texto mostrado. */
const MD_BLOCKS = new Set(['paragraph', 'heading', 'code', 'tableCell']);

/**
 * Texto mostrado de una nota o documento Markdown para las anclas de texto
 * (`domain/anchors.ts`), con el desplazamiento de cada tramo en el cuerpo fuente. Se recorre el
 * AST, igual que al extraer enlaces: las marcas de Markdown no forman parte de las citas.
 */
export function markdownProjection(body: string): TextProjection {
  const builder = new ProjectionBuilder();
  const segment = (node: MdNode, value: string) => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined) return builder.append(value);
    // El valor suele aparecer tal cual dentro del nodo (texto, código); con escapes o entidades
    // no, y el tramo abarca el nodo entero.
    const at = body.slice(from, to).indexOf(value);
    if (at >= 0) builder.append(value, from + at, from + at + value.length);
    else builder.append(value, from, to);
  };
  const walk = (node: MdNode) => {
    const block = MD_BLOCKS.has(node.type);
    if (block) builder.startBlock(null);
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
      if (node.value) segment(node, node.value);
    } else if (node.type === 'break') {
      builder.append(' ');
    }
    for (const child of node.children ?? []) walk(child);
    if (block) builder.endBlock();
  };
  walk(parser.parse(body) as MdNode);
  return builder.build();
}

interface SceneElement {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  containerId?: unknown;
  isDeleted?: unknown;
  link?: unknown;
}

/**
 * Lienzos: texto de formas, etiquetas de flechas y textos libres, agrupado por el elemento que
 * lo contiene; enlaces desde el sidecar (autoridad) y, por compatibilidad, desde `element.link`.
 */
export function extractCanvas(sceneJson: string | null, sidecarJson: string | null): Extracted {
  const links: ExtractedLink[] = [];
  const byElement = new Map<string, string[]>();
  let elements: SceneElement[];
  try {
    elements = (
      (JSON.parse(sceneJson ?? '{}') as { elements?: SceneElement[] }).elements ?? []
    ).filter((e) => !e.isDeleted);
  } catch {
    elements = [];
  }
  for (const el of elements) {
    if (el.type === 'text' && typeof el.text === 'string' && typeof el.id === 'string') {
      const owner = typeof el.containerId === 'string' && el.containerId ? el.containerId : el.id;
      byElement.set(owner, [...(byElement.get(owner) ?? []), el.text]);
    }
  }
  const linked = new Set<string>();
  const linkOf = new Map<string, string>();
  for (const el of elements) {
    if (typeof el.id === 'string' && typeof el.link === 'string') linkOf.set(el.id, el.link);
  }
  const push = (elementId: string, target: InternalTarget) =>
    links.push({
      sourceElementId: elementId,
      ...targetFields(target),
      kind: 'element',
      label: (byElement.get(elementId) ?? []).join(' '),
      context: context((byElement.get(elementId) ?? []).join(' ')),
    });
  if (sidecarJson) {
    try {
      const sidecar = parseCanvasExtensions(JSON.parse(sidecarJson)).extensions;
      for (const [elementId, entry] of Object.entries(sidecar?.elementLinks ?? {})) {
        linked.add(elementId);
        // El ancla viene del sidecar; si lo escribió una versión que no la guardaba, del enlace.
        const fromLink = parseInternalLink(linkOf.get(elementId) ?? '');
        const anchor = entry.fragment
          ? parseLinkFragment(entry.fragment)
          : fromLink?.documentId === entry.documentId
            ? fromLink
            : null;
        push(elementId, {
          documentId: entry.documentId,
          elementId: entry.elementId,
          blockId: anchor?.blockId ?? null,
          eventId: anchor?.eventId ?? null,
          text: anchor?.text ?? null,
        });
      }
    } catch {
      // Sidecar ilegible: ya se trata como contenido inválido al abrir el lienzo.
    }
  }
  for (const [elementId, link] of linkOf) {
    if (linked.has(elementId)) continue;
    const target = parseInternalLink(link);
    if (target) push(elementId, target);
  }
  const searchElements = [...byElement].map(([elementId, texts]) => ({
    elementId,
    text: texts.join(' '),
  }));
  return {
    links,
    text: searchElements.map((e) => e.text).join(' '),
    elements: searchElements,
    elementIds: elements.flatMap((e) => (typeof e.id === 'string' ? [e.id] : [])),
  };
}

/** Clave de comparación de títulos para resolver [[Título]] (NFC, sin espacios extremos, sin mayúsculas). */
export function titleKey(title: string): string {
  return title.normalize('NFC').trim().toLowerCase();
}
