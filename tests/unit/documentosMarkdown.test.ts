import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { RichDocData, RichNode } from '../../src/domain/richDoc.ts';
import { relinkAssets, richDocToMarkdown } from '../../src/domain/richDocMarkdown.ts';
import { buildDocx } from '../../src/features/docs/exportDocx.ts';
import { renderMarkdownPreview } from '../../src/features/notes/markdown.ts';

const text = (value: string, marks?: RichNode['marks']): RichNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });
const cell = (type: 'tableCell' | 'tableHeader', value: string): RichNode => ({
  type,
  content: [p(text(value))],
});
const table: RichNode = {
  type: 'table',
  content: [
    { type: 'tableRow', content: [cell('tableHeader', 'Tarea'), cell('tableHeader', 'Estado')] },
    { type: 'tableRow', content: [cell('tableCell', 'Plan | A'), cell('tableCell', 'hecho')] },
  ],
};
const doc = (...content: RichNode[]): RichDocData => ({
  schemaVersion: 1,
  content: { type: 'doc', content },
});
const md = (d: RichDocData) => richDocToMarkdown(d, { tabLabel: (n) => `Pestaña ${n}` });
const HASH = 'a'.repeat(64);

describe('documento con formato → Markdown (plan 9.8)', () => {
  it('títulos, marcas, listas, citas, código, separador, enlaces e imágenes', () => {
    const result = md(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Título')] },
        p(
          text('Hola '),
          text('negrita', [{ type: 'bold' }]),
          text(' y '),
          text('ambas ', [{ type: 'bold' }, { type: 'italic' }]),
          text('código', [{ type: 'code' }]),
          text(' '),
          text('nota', [{ type: 'link', attrs: { href: 'aline://document/x1' } }]),
        ),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [p(text('uno'))] },
            {
              type: 'listItem',
              content: [
                p(text('dos')),
                {
                  type: 'orderedList',
                  attrs: { start: 1 },
                  content: [{ type: 'listItem', content: [p(text('a'))] }],
                },
              ],
            },
          ],
        },
        { type: 'blockquote', content: [p(text('cita'))] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;')] },
        { type: 'horizontalRule' },
        p({ type: 'image', attrs: { src: `mindnote-asset:${HASH}`, alt: 'foto' } }),
        p(text('# no es título y *no* cursiva')),
      ),
    );
    expect(result.markdown).toBe(
      [
        '## Título',
        '',
        'Hola **negrita** y ***ambas*** `código` [nota](aline://document/x1)',
        '',
        '- uno',
        '- dos',
        '',
        '  1. a',
        '',
        '> cita',
        '',
        '```ts',
        'const a = 1;',
        '```',
        '',
        '---',
        '',
        `![foto](mindnote-asset:${HASH})`,
        '',
        '\\# no es título y \\*no\\* cursiva',
        '',
      ].join('\n'),
    );
    expect(result.dropped).toEqual([]);
  });

  it('tablas GFM con el encabezado y las barras escapadas; se leen como tabla', () => {
    const { markdown } = md(doc(table));
    expect(markdown).toBe('| Tarea | Estado |\n| --- | --- |\n| Plan \\| A | hecho |\n');
    expect(renderMarkdownPreview(markdown)).toContain('<td>Plan | A</td>');
  });

  it('informa de lo que Markdown no admite y pone cada pestaña bajo su título', () => {
    const result = md({
      schemaVersion: 1,
      content: doc(p(text('sub', [{ type: 'underline' }])), {
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [text('Fuente', [{ type: 'textStyle', attrs: { fontFamily: 'Lora' } }])],
      }).content,
      tabs: [
        { id: 'main', title: 'Inicio' },
        { id: 't2', title: '', content: doc(p(text('Anexo'))).content },
      ],
      comments: [],
    } as RichDocData);
    expect(result.markdown).toBe('# Inicio\n\nsub\n\nFuente\n\n# Pestaña 2\n\nAnexo\n');
    expect(result.dropped).toEqual(['alignment', 'font', 'underline']);
  });

  it('relinkAssets cambia las referencias del almacén por rutas de archivo', () => {
    expect(relinkAssets(`![x](mindnote-asset:${HASH})`, (h) => `assets/${h.slice(0, 4)}.png`)).toBe(
      '![x](assets/aaaa.png)',
    );
  });
});

describe('tablas en Word (plan 9.7)', () => {
  it('exporta la tabla con su fila de encabezado', async () => {
    const built = await buildDocx(doc(p(text('Antes')), table), {
      title: 'Tabla',
      tabLabel: (n) => `Pestaña ${n}`,
      image: async () => null,
    });
    const { Packer } = await import('docx');
    const xml = strFromU8(
      unzipSync(new Uint8Array(await Packer.toBuffer(built)))['word/document.xml']!,
    );
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml.indexOf('Tarea')).toBeLessThan(xml.indexOf('Plan | A'));
  });
});
