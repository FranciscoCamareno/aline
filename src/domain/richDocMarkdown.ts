import { docTabs, type RichDocData, type RichNode } from './richDoc.ts';

/**
 * Documento con formato → Markdown (plan 9.8), para «Exportar → Markdown» y la exportación por
 * carpetas. Las imágenes quedan citadas como `mindnote-asset:<sha256>`, igual que en un documento
 * Markdown; quien exporta las convierte en archivos (`relinkAssets`). Lo que Markdown no puede
 * expresar se descarta y se informa en `dropped`.
 */
export type MarkdownLoss = 'font' | 'underline' | 'alignment' | 'comments';

export interface RichDocMarkdown {
  markdown: string;
  dropped: MarkdownLoss[];
}

type Mark = NonNullable<RichNode['marks']>[number];

/** Caracteres con significado en Markdown dentro de un párrafo. */
const escapeInline = (text: string) => text.replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`);

/** Al principio de un bloque, lo que se leería como título, cita, lista o separador. */
const escapeLineStart = (text: string) =>
  text.replace(/^(\s*)([#>+-]|\d+[.)])(?=\s|$)/, (_m, space: string, mark: string) =>
    mark.length > 1 ? `${space}${mark.slice(0, -1)}\\${mark.slice(-1)}` : `${space}\\${mark}`,
  );

export function richDocToMarkdown(
  doc: RichDocData,
  options: { tabLabel: (n: number) => string },
): RichDocMarkdown {
  const dropped = new Set<MarkdownLoss>();

  const markKey = (marks: readonly Mark[]) =>
    JSON.stringify(
      marks
        .filter((m) => ['bold', 'italic', 'strike', 'code', 'link'].includes(m.type))
        .map((m) => (m.type === 'link' ? `link:${String(m.attrs?.['href'] ?? '')}` : m.type))
        .sort(),
    );

  const inline = (nodes: readonly RichNode[], inTable = false): string => {
    // Tramos de texto seguidos con las mismas marcas se juntan: «**ab**», no «**a****b**».
    const runs: Array<{ text: string; marks: Mark[] } | { br: true }> = [];
    for (const node of nodes) {
      if (node.type === 'hardBreak') {
        runs.push({ br: true });
        continue;
      }
      if (node.type !== 'text' || !node.text) continue;
      const marks = node.marks ?? [];
      for (const m of marks) {
        if (m.type === 'underline') dropped.add('underline');
        if (m.type === 'comment') dropped.add('comments');
        if (m.type === 'textStyle' && (m.attrs?.['fontFamily'] || m.attrs?.['fontSize'])) {
          dropped.add('font');
        }
      }
      const last = runs.at(-1);
      if (last && 'text' in last && markKey(last.marks) === markKey(marks)) last.text += node.text;
      else runs.push({ text: node.text, marks });
    }
    return runs
      .map((run) => {
        if ('br' in run) return inTable ? '<br>' : '\\\n';
        const has = (type: string) => run.marks.find((m) => m.type === type);
        if (has('code')) {
          const ticks = run.text.includes('`') ? '``' : '`';
          const body = ticks.length > 1 ? ` ${run.text} ` : run.text;
          return wrapLink(`${ticks}${body}${ticks}`, has('link'));
        }
        // Los espacios de los extremos quedan fuera de los marcadores («** a**» no es negrita).
        const lead = /^\s*/.exec(run.text)![0];
        const trail = /\s*$/.exec(run.text.slice(lead.length))![0];
        let body = escapeInline(run.text.slice(lead.length, run.text.length - trail.length));
        if (body) {
          if (has('strike')) body = `~~${body}~~`;
          if (has('italic')) body = `*${body}*`;
          if (has('bold')) body = `**${body}**`;
          body = wrapLink(body, has('link'));
        }
        return lead + body + trail;
      })
      .join('');
  };

  const wrapLink = (text: string, link: Mark | undefined) => {
    const href = typeof link?.attrs?.['href'] === 'string' ? link.attrs['href'] : '';
    return href ? `[${text}](${destination(href)})` : text;
  };

  const image = (node: RichNode) => {
    const src = typeof node.attrs?.['src'] === 'string' ? node.attrs['src'] : '';
    const alt = typeof node.attrs?.['alt'] === 'string' ? node.attrs['alt'] : '';
    return src ? `![${escapeInline(alt)}](${destination(src)})` : '';
  };

  /** Bloques de un contenedor, separados por una línea en blanco. */
  const blocks = (nodes: readonly RichNode[]): string =>
    nodes
      .map(block)
      .filter((b) => b !== '')
      .join('\n\n');

  const block = (node: RichNode): string => {
    const align = node.attrs?.['textAlign'];
    if (typeof align === 'string' && align !== 'left') dropped.add('alignment');
    switch (node.type) {
      case 'paragraph': {
        const images = (node.content ?? []).filter((c) => c.type === 'image').map(image);
        const text = escapeLineStart(inline(node.content ?? []));
        return [text, ...images].filter(Boolean).join('\n\n');
      }
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.['level']) || 1, 1), 6);
        return `${'#'.repeat(level)} ${inline(node.content ?? [])}`;
      }
      case 'codeBlock': {
        const code = (node.content ?? []).map((c) => c.text ?? '').join('');
        const fence = code.includes('```') ? '~~~~' : '```';
        const language = typeof node.attrs?.['language'] === 'string' ? node.attrs['language'] : '';
        return `${fence}${language}\n${code}\n${fence}`;
      }
      case 'blockquote':
        return blocks(node.content ?? [])
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n');
      case 'bulletList':
      case 'orderedList': {
        const start = Number(node.attrs?.['start']) || 1;
        return (node.content ?? [])
          .map((item, i) => {
            const marker = node.type === 'bulletList' ? '-' : `${start + i}.`;
            const pad = ' '.repeat(marker.length + 1);
            const body = blocks(item.content ?? []);
            return `${marker} ${body
              .split('\n')
              .join(`\n${pad}`)
              .replace(/\n\s+\n/g, '\n\n')}`;
          })
          .join('\n');
      }
      case 'horizontalRule':
        return '---';
      case 'image':
        return image(node);
      case 'table':
        return table(node);
      default:
        // Nodo desconocido (de una versión posterior): su contenido, para no perder el texto.
        if (node.content?.some((c) => c.type === 'text' || c.type === 'hardBreak')) {
          return inline(node.content);
        }
        return blocks(node.content ?? []);
    }
  };

  /** Tabla GFM; la primera fila es el encabezado (GFM lo exige), aunque no lo fuera. */
  const table = (node: RichNode): string => {
    const rows = (node.content ?? []).map((row) =>
      (row.content ?? []).map((cell) =>
        (cell.content ?? [])
          .map((p) => inline(p.content ?? [], true))
          .filter(Boolean)
          .join('<br>')
          .replace(/\n/g, ' '),
      ),
    );
    if (!rows.length) return '';
    const width = Math.max(...rows.map((r) => r.length), 1);
    const line = (cells: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
    return [
      line(rows[0]!),
      `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
      ...rows.slice(1).map(line),
    ].join('\n');
  };

  const tabs = docTabs(doc);
  const parts = tabs.map((tab, index) => {
    const body = blocks(tab.content.content ?? []);
    if (tabs.length === 1) return body;
    // Con varias pestañas, cada una empieza con su título (como en la exportación a Word).
    const title = escapeInline(tab.title || options.tabLabel(index + 1));
    return body ? `# ${title}\n\n${body}` : `# ${title}`;
  });
  if (doc.comments?.length) dropped.add('comments');
  const markdown = parts.filter(Boolean).join('\n\n');
  return { markdown: markdown ? `${markdown}\n` : '', dropped: [...dropped].sort() };
}

/** Destino de un enlace o imagen; entre `<>` si lleva espacios o paréntesis. */
function destination(url: string): string {
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;
}

/** Cambia cada `mindnote-asset:<sha256>` de un Markdown por la ruta que da `pathFor`. */
export function relinkAssets(markdown: string, pathFor: (hash: string) => string): string {
  return markdown.replace(/mindnote-asset:([0-9a-f]{64})/g, (_m, hash: string) => pathFor(hash));
}
