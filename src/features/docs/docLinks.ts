/**
 * Enlaces de un documento en el orden en que aparecen (plan 10.5): las marcas `link` de su
 * contenido, juntando los trozos de texto seguidos con el mismo destino (un enlace con una parte
 * en negrita es un solo enlace). Vale para Tiptap y Milkdown: solo usa la forma común de los
 * nodos de ProseMirror (cada editor trae su propia copia de la librería).
 */
export interface FoundLink {
  href: string;
  text: string;
}

export interface LiveLink extends FoundLink {
  from: number;
  to: number;
}

/** Lo que se usa de un nodo vivo de ProseMirror. */
interface LiveNode {
  isText: boolean;
  text?: string | null | undefined;
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[];
  nodeSize: number;
}
interface LiveDoc {
  descendants(fn: (node: LiveNode, pos: number) => boolean | void): void;
}

/** Nodo del JSON guardado (las pestañas que no están abiertas). */
interface JsonNode {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: JsonNode[];
}

function hrefOf(marks: readonly { name: string; attrs?: Record<string, unknown> }[]): string | null {
  const link = marks.find((m) => m.name === 'link');
  const href = link?.attrs?.['href'];
  return typeof href === 'string' && href ? href : null;
}

/** Enlaces del documento abierto, con su posición para seleccionarlos. */
export function liveLinks(doc: LiveDoc): LiveLink[] {
  const found: LiveLink[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const href = hrefOf(node.marks.map((m) => ({ name: m.type.name, attrs: m.attrs })));
    if (!href) return false;
    const last = found.at(-1);
    if (last && last.href === href && last.to === pos) {
      last.text += node.text ?? '';
      last.to = pos + node.nodeSize;
    } else {
      found.push({ href, text: node.text ?? '', from: pos, to: pos + node.nodeSize });
    }
    return false;
  });
  return found;
}

/** Enlaces de un contenido guardado como JSON, en el mismo orden que `liveLinks`. */
export function jsonLinks(content: unknown): FoundLink[] {
  const found: FoundLink[] = [];
  const walk = (node: JsonNode) => {
    // Los trozos seguidos solo se juntan dentro del mismo bloque, como en `liveLinks`.
    let previous: FoundLink | null = null;
    for (const child of node.content ?? []) {
      if (child.type === 'text') {
        const href = hrefOf((child.marks ?? []).map((m) => ({ name: m.type ?? '', attrs: m.attrs ?? {} })));
        if (!href) {
          previous = null;
        } else if (previous && previous.href === href) {
          previous.text += child.text ?? '';
        } else {
          previous = { href, text: child.text ?? '' };
          found.push(previous);
        }
      } else {
        previous = null;
        walk(child);
      }
    }
  };
  if (content && typeof content === 'object') walk(content as JsonNode);
  return found;
}
