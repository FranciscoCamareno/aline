import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { internalLink } from '../../domain/links.ts';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/**
 * Las imágenes externas se muestran como referencias: no se hacen peticiones silenciosas para
 * renderizarlas (diseño §13). Se sustituyen por un enlace con su texto alternativo.
 */
function rehypeImagesAsReferences() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === 'element' && child.tagName === 'img') {
          const src = typeof child.properties?.['src'] === 'string' ? child.properties['src'] : '';
          const alt = typeof child.properties?.['alt'] === 'string' ? child.properties['alt'] : '';
          return {
            type: 'element',
            tagName: 'a',
            properties: { href: src, className: ['image-reference'] },
            children: [{ type: 'text', value: `🖼 ${alt || src}` }],
          };
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  data?: { hProperties?: Record<string, unknown> };
  children?: MdNode[];
}

/** `[[Título]]` o `[[Título|texto]]` escrito a mano (la misma forma que indexa knowledge.ts). */
const WIKI = /\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g;

/** Destino de un `[[Título]]`: id del documento, o null si no hay uno único. */
export type WikiResolver = (title: string) => string | null;

/**
 * Los `[[Título]]` escritos a mano se muestran como enlaces (plan 9.6): al documento si el título
 * es único, o marcados como rotos. Se resuelven al pintar; el Markdown fuente no cambia.
 */
function remarkWikiLinks(resolve: WikiResolver | undefined) {
  return (tree: MdNode) => {
    if (!resolve) return;
    const walk = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value?.includes('[[')) {
          walk(child);
          return [child];
        }
        const parts: MdNode[] = [];
        let last = 0;
        for (const match of child.value.matchAll(WIKI)) {
          if (match.index > last)
            parts.push({ type: 'text', value: child.value.slice(last, match.index) });
          const title = match[1]!.normalize('NFC').trim();
          const id = resolve(title);
          parts.push({
            type: 'link',
            // Un enlace interno sin destino: al pulsarlo la vista lo marca como roto.
            url: id ? internalLink(id) : 'aline://document/',
            data: { hProperties: { className: id ? ['wiki-link'] : ['wiki-link', 'broken-link'] } },
            children: [{ type: 'text', value: match[2]?.trim() || title }],
          });
          last = match.index + match[0].length;
        }
        if (last < child.value.length) parts.push({ type: 'text', value: child.value.slice(last) });
        return parts;
      });
    };
    walk(tree);
  };
}

const schema: SanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    // `aline:` y el esquema anterior `mindnote:` (enlaces internos, domain/links.ts).
    href: [...(defaultSchema.protocols?.['href'] ?? []), 'aline', 'mindnote'],
  },
  attributes: {
    ...defaultSchema.attributes,
    // El esquema por defecto ya tiene una regla `className` para `a` y solo cuenta la primera:
    // se sustituye por una con todas las clases permitidas.
    a: [
      ...(defaultSchema.attributes?.['a'] ?? []).filter(
        (rule) => !(Array.isArray(rule) && rule[0] === 'className'),
      ),
      ['className', 'data-footnote-backref', 'image-reference', 'wiki-link', 'broken-link'],
    ],
  },
};

// HTML crudo desactivado: remark-rehype sin allowDangerousHtml descarta los nodos HTML.
const processor = (resolve?: WikiResolver) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks, resolve)
    .use(remarkRehype)
    .use(rehypeImagesAsReferences)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify);

/** Vista previa saneada; el Markdown fuente nunca se modifica. */
export function renderMarkdownPreview(markdown: string, resolve?: WikiResolver): string {
  return String(processor(resolve).processSync(markdown));
}
