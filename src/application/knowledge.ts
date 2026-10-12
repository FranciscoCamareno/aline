import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parseCanvasExtensions } from '../domain/compat.ts';
import { isUuid } from '../domain/ids.ts';

/**
 * Extracción de enlaces y texto indexable (diseño §10): se hace sobre el AST de Markdown, no con
 * expresiones regulares sobre el texto completo, para respetar código, escapes y enlaces.
 * Los índices que se construyen con esto son derivados y reconstruibles.
 */
export const INTERNAL_PREFIX = 'mindnote://document/';

export interface ExtractedLink {
  /** Elemento de lienzo de origen; null en notas. */
  sourceElementId: string | null;
  /** Destino por UUID (enlace Markdown o de elemento); null en un [[Título]] sin resolver. */
  targetDocumentId: string | null;
  targetElementId: string | null;
  kind: 'markdown' | 'wiki' | 'element';
  /** Texto visible del enlace o título de un [[Título]]. */
  label: string;
}

export interface SearchElement {
  elementId: string;
  text: string;
}

export interface Extracted {
  links: ExtractedLink[];
  /** Texto plano para la búsqueda de texto completo. */
  text: string;
  /** Lienzos: texto por elemento para localizar la coincidencia (diseño §10.1). */
  elements: SearchElement[];
}

/** mindnote://document/<uuid>[#elemento] → destino; null si no es un enlace interno válido. */
export function parseInternalLink(
  url: string,
): { documentId: string; elementId: string | null } | null {
  if (!url.startsWith(INTERNAL_PREFIX)) return null;
  const rest = url.slice(INTERNAL_PREFIX.length);
  const [documentId = '', fragment] = rest.split('#', 2);
  if (!isUuid(documentId)) return null;
  return { documentId, elementId: fragment ? decodeURIComponent(fragment) : null };
}

export function internalLink(documentId: string, elementId?: string | null): string {
  return `${INTERNAL_PREFIX}${documentId}${elementId ? `#${encodeURIComponent(elementId)}` : ''}`;
}

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const WIKI = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;
const parser = unified().use(remarkParse).use(remarkGfm);

function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(nodeText).join('');
}

export function extractNote(body: string): Extracted {
  const links: ExtractedLink[] = [];
  const parts: string[] = [];
  const walk = (node: MdNode, inCode: boolean) => {
    if (node.type === 'link' && node.url) {
      const target = parseInternalLink(node.url);
      if (target) {
        links.push({
          sourceElementId: null,
          targetDocumentId: target.documentId,
          targetElementId: target.elementId,
          kind: 'markdown',
          label: nodeText(node),
        });
      }
    }
    if (node.type === 'text' && node.value && !inCode) {
      for (const match of node.value.matchAll(WIKI)) {
        links.push({
          sourceElementId: null,
          targetDocumentId: null,
          targetElementId: null,
          kind: 'wiki',
          label: match[1]!.normalize('NFC').trim(),
        });
      }
    }
    if (typeof node.value === 'string') parts.push(node.value);
    const code = inCode || node.type === 'code' || node.type === 'inlineCode';
    for (const child of node.children ?? []) walk(child, code);
  };
  walk(parser.parse(body) as MdNode, false);
  return { links, text: parts.join(' ').replace(/\s+/g, ' ').trim(), elements: [] };
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
  if (sidecarJson) {
    try {
      const sidecar = parseCanvasExtensions(JSON.parse(sidecarJson)).extensions;
      for (const [elementId, target] of Object.entries(sidecar?.elementLinks ?? {})) {
        linked.add(elementId);
        links.push({
          sourceElementId: elementId,
          targetDocumentId: target.documentId,
          targetElementId: target.elementId,
          kind: 'element',
          label: (byElement.get(elementId) ?? []).join(' '),
        });
      }
    } catch {
      // Sidecar ilegible: ya se trata como contenido inválido al abrir el lienzo.
    }
  }
  for (const el of elements) {
    if (typeof el.id !== 'string' || linked.has(el.id) || typeof el.link !== 'string') continue;
    const target = parseInternalLink(el.link);
    if (target) {
      links.push({
        sourceElementId: el.id,
        targetDocumentId: target.documentId,
        targetElementId: target.elementId,
        kind: 'element',
        label: (byElement.get(el.id) ?? []).join(' '),
      });
    }
  }
  const searchElements = [...byElement].map(([elementId, texts]) => ({
    elementId,
    text: texts.join(' '),
  }));
  return {
    links,
    text: searchElements.map((e) => e.text).join(' '),
    elements: searchElements,
  };
}

/** Clave de comparación de títulos para resolver [[Título]] (NFC, sin espacios extremos, sin mayúsculas). */
export function titleKey(title: string): string {
  return title.normalize('NFC').trim().toLowerCase();
}
