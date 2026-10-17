import { describe, expect, it } from 'vitest';
import { markdownProjection } from '../../src/application/knowledge.ts';
import {
  findTextSelector,
  resolveAnchor,
  sourceOffset,
  textSelectorFor,
} from '../../src/domain/anchors.ts';
import {
  hasInternalScheme,
  internalLink,
  parseInternalLink,
  type TextSelector,
} from '../../src/domain/links.ts';
import { richDocProjection, type RichDocData } from '../../src/domain/richDoc.ts';

const DOC = '8b53f815-9d38-4313-a1ad-cb690fabf23c';
const EVENT = '0b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111';
const none = { elementId: null, blockId: null, eventId: null, text: null };
const quote = (start: string, extra: Partial<TextSelector> = {}): TextSelector => ({
  prefix: '',
  start,
  end: '',
  suffix: '',
  ...extra,
});

describe('enlaces internos aline:// (formato §2.3.1)', () => {
  it('escribe con el esquema aline:// y lee también el anterior mindnote://', () => {
    expect(internalLink(DOC)).toBe(`aline://document/${DOC}`);
    expect(parseInternalLink(`aline://document/${DOC}`)).toEqual({ documentId: DOC, ...none });
    expect(parseInternalLink(`mindnote://document/${DOC}#nodo%201`)).toEqual({
      documentId: DOC,
      ...none,
      elementId: 'nodo 1',
    });
    expect(parseInternalLink('aline://document/no-uuid')).toBeNull();
    expect(parseInternalLink(`https://example.com/${DOC}`)).toBeNull();
    expect(hasInternalScheme('aline://document/roto')).toBe(true);
    expect(hasInternalScheme('mindnote://x')).toBe(true);
    expect(hasInternalScheme('https://example.com')).toBe(false);
  });

  it('un elemento de lienzo se escribe en la forma original, sin clave', () => {
    const url = internalLink(DOC, { elementId: 'a-b_1' });
    expect(url).toBe(`aline://document/${DOC}#a-b_1`);
    expect(parseInternalLink(url)?.elementId).toBe('a-b_1');
  });

  it('ida y vuelta de bloque, evento y cita con caracteres reservados', () => {
    const text = quote('a, b - c & d = e #f', { prefix: 'antes-', suffix: '-después', end: 'fin' });
    const url = internalLink(DOC, { blockId: 'k3-x', eventId: EVENT, text });
    expect(url).not.toMatch(/#.*#/); // el fragmento no repite «#»
    expect(parseInternalLink(url)).toEqual({
      documentId: DOC,
      elementId: null,
      blockId: 'k3-x',
      eventId: EVENT,
      text,
    });
  });

  it('reconoce la gramática de los fragmentos de texto: prefijo, inicio, fin y sufijo', () => {
    const parse = (t: string) => parseInternalLink(`aline://document/${DOC}#t=${t}`)?.text;
    expect(parse('hola')).toEqual(quote('hola'));
    expect(parse('el-,gato')).toEqual(quote('gato', { prefix: 'el' }));
    expect(parse('gato,-negro')).toEqual(quote('gato', { suffix: 'negro' }));
    expect(parse('el-,inicio,fin,-negro')).toEqual(
      quote('inicio', { prefix: 'el', end: 'fin', suffix: 'negro' }),
    );
    expect(parse('a,b,c')).toBeNull(); // demasiadas partes
    expect(parse('%E0%A4%A')).toBeNull(); // codificación rota
    expect(parse('%20')).toBeNull(); // cita vacía
  });

  it('ignora claves desconocidas o mal formadas sin invalidar el enlace', () => {
    expect(parseInternalLink(`aline://document/${DOC}#zz=1&b=con%20espacio&ev=no-uuid`)).toEqual({
      documentId: DOC,
      ...none,
    });
  });
});

describe('citas textuales (diseño §10)', () => {
  const text = 'El gato negro duerme. Otro gato blanco come. El gato negro despierta.';

  it('crea un selector con contexto y lo vuelve a encontrar', () => {
    const from = text.lastIndexOf('gato negro');
    const selector = textSelectorFor(text, from, from + 'gato negro'.length)!;
    expect(selector.start).toBe('gato negro');
    expect(selector.prefix).toMatch(/El$/);
    expect(selector.suffix).toMatch(/^despierta/);
    expect(findTextSelector(text, selector)).toEqual({
      from,
      to: from + 10,
      contextMatched: true,
    });
  });

  it('una selección sin texto no da selector', () => {
    expect(textSelectorFor(text, 3, 3)).toBeNull();
    expect(textSelectorFor('a   b', 1, 4)).toBeNull();
  });

  it('las citas largas guardan comienzo y final y se encuentran enteras', () => {
    const long = `Inicio ${'palabra '.repeat(60)}final del fragmento.`;
    const doc = `Antes. ${long} Después.`;
    const from = doc.indexOf(long);
    const selector = textSelectorFor(doc, from, from + long.length)!;
    expect(selector.end).not.toBe('');
    expect(selector.start.length).toBeLessThanOrEqual(60);
    expect(findTextSelector(doc, selector)).toMatchObject({ from, to: from + long.length });
  });

  it('tolera mayúsculas, diacríticos y espacios distintos, y devuelve posiciones originales', () => {
    const doc = 'Una  CANCIÓN\n  de   cuna';
    expect(findTextSelector(doc, quote('cancion de cuna'))).toEqual({
      from: 5,
      to: doc.length,
      contextMatched: true,
    });
  });

  it('si el contexto cambió, sigue encontrando la cita y lo indica', () => {
    expect(findTextSelector(text, quote('gato blanco', { prefix: 'Ningún' }))).toMatchObject({
      contextMatched: false,
    });
    expect(findTextSelector(text, quote('perro'))).toBeNull();
  });
});

describe('resolución de anclas sobre el texto mostrado', () => {
  const rich: RichDocData = {
    schemaVersion: 1,
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, anchor: 'h1' },
          content: [{ type: 'text', text: 'Título' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  attrs: { anchor: 'p1' },
                  content: [
                    { type: 'text', text: 'Primera ' },
                    { type: 'text', text: 'idea', marks: [{ type: 'bold' }] },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'segunda línea' },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Primera idea repetida' }] },
      ],
    },
  };

  it('proyecta un documento con formato con bloques, anclas y posiciones de ProseMirror', () => {
    const p = richDocProjection(rich);
    expect(p.text).toBe('Título\nPrimera idea segunda línea\n\nPrimera idea repetida');
    expect(p.blocks.map((b) => b.id)).toEqual(['h1', 'p1', null, null]);
    // título: abre en 0, texto 1–7, cierra en 7; lista (8) > elemento (9) > párrafo (10) → 11.
    expect(sourceOffset(p, 0, 'start')).toBe(1);
    expect(sourceOffset(p, p.text.indexOf('idea'), 'start')).toBe(19);
    expect(sourceOffset(p, p.text.indexOf('segunda'), 'start')).toBe(24);
  });

  it('busca la cita dentro del bloque y, si salió de él, en todo el documento', () => {
    const p = richDocProjection(rich);
    const inBlock = resolveAnchor(p, { blockId: 'p1', text: quote('Primera idea') });
    expect(inBlock).toEqual({ status: 'found', from: 7, to: 19 }); // no la repetida del final
    const moved = resolveAnchor(p, { blockId: 'h1', text: quote('repetida') });
    expect(moved).toMatchObject({ status: 'found', from: p.text.indexOf('repetida') });
  });

  it('bloque sin la cita: aproximado; ni bloque ni cita: perdido', () => {
    const p = richDocProjection(rich);
    expect(resolveAnchor(p, { blockId: 'p1', text: quote('borrado') })).toEqual({
      status: 'approximate',
      from: 7,
      to: 7 + 'Primera idea segunda línea'.length,
    });
    expect(resolveAnchor(p, { blockId: 'h1', text: null })).toEqual({
      status: 'found',
      from: 0,
      to: 6,
    });
    expect(resolveAnchor(p, { blockId: 'otro', text: null })).toEqual({ status: 'lost' });
    expect(resolveAnchor(p, { blockId: null, text: quote('nada') })).toEqual({ status: 'lost' });
    expect(resolveAnchor(p, { blockId: null, text: null })).toBeNull();
  });

  it('proyecta Markdown sin marcas y traduce al desplazamiento del cuerpo fuente', () => {
    const body =
      '# Plan\n\nUna **idea** con `código` y [enlace](https://example.com).\n\n- punto\n';
    const p = markdownProjection(body);
    expect(p.text).toBe('Plan\nUna idea con código y enlace.\npunto');
    const match = resolveAnchor(p, { blockId: null, text: quote('idea con código') });
    expect(match?.status).toBe('found');
    if (match?.status !== 'found') return;
    const from = sourceOffset(p, match.from, 'start')!;
    const to = sourceOffset(p, match.to, 'end')!;
    expect(body.slice(from, to)).toBe('idea** con `código');
  });

  it('las citas no cuentan las marcas de Markdown', () => {
    const p = markdownProjection('Texto con \\*asterisco\\* escapado');
    expect(p.text).toBe('Texto con *asterisco* escapado');
    expect(findTextSelector(p.text, quote('*asterisco*'))).not.toBeNull();
  });
});
