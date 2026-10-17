import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

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

const schema: SanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    // `aline:` y el esquema anterior `mindnote:` (enlaces internos, domain/links.ts).
    href: [...(defaultSchema.protocols?.['href'] ?? []), 'aline', 'mindnote'],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), ['className', 'image-reference']],
  },
};

// HTML crudo desactivado: remark-rehype sin allowDangerousHtml descarta los nodos HTML.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeImagesAsReferences)
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

/** Vista previa saneada; el Markdown fuente nunca se modifica. */
export function renderMarkdownPreview(markdown: string): string {
  return String(processor.processSync(markdown));
}
