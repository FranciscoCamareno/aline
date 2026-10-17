import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import {
  projectionOffset,
  quoteLabel,
  resolveAnchor,
  selectorForRange,
  sourceOffset,
} from '../../src/domain/anchors.ts';
import { richDocProjection, type RichDocData } from '../../src/domain/richDoc.ts';
import {
  BlockAnchors,
  blockAnchorsPlugin,
  withoutEmptyAnchors,
} from '../../src/features/docs/blockAnchors.ts';
import { pmProjection } from '../../src/features/knowledge/pmProjection.ts';

/** El esquema real del editor de documentos con formato, sin montar el editor. */
const schema = getSchema([StarterKit, BlockAnchors]);

const content: RichDocData['content'] = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1, anchor: 'tit' },
      content: [{ type: 'text', text: 'Guion' }],
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
                { type: 'text', text: 'Escena ' },
                { type: 'text', text: 'uno', marks: [{ type: 'bold' }] },
                { type: 'hardBreak' },
                { type: 'text', text: 'de noche' },
              ],
            },
          ],
        },
      ],
    },
    { type: 'paragraph' },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const a = 1;' }] },
  ],
};

describe('anclas en el editor de documentos con formato (fase 7.C)', () => {
  it('el texto mostrado del editor coincide con el del JSON guardado', () => {
    const doc = Node.fromJSON(schema, content);
    const live = pmProjection(doc);
    const stored = richDocProjection({ schemaVersion: 1, content });
    expect(live).toEqual(stored);
    expect(live.blocks.map((b) => b.id)).toEqual(['tit', 'p1', null, null]);
    // Las posiciones de ProseMirror son las del documento real.
    const at = sourceOffset(live, live.text.indexOf('uno'), 'start')!;
    expect(doc.textBetween(at, at + 3)).toBe('uno');
  });

  it('la selección del editor se convierte en cita y vuelve al mismo rango', () => {
    const doc = Node.fromJSON(schema, content);
    const p = pmProjection(doc);
    const from = sourceOffset(p, p.text.indexOf('uno'), 'start')!;
    const to = sourceOffset(p, p.text.indexOf('de noche') + 8, 'end')!;
    const selector = selectorForRange(
      p,
      projectionOffset(p, from, 'start'),
      projectionOffset(p, to, 'end'),
    )!;
    expect(selector.start).toBe('uno de noche');
    expect(quoteLabel(selector)).toBe('uno de noche');
    const found = resolveAnchor(p, { blockId: 'p1', text: selector });
    expect(found?.status).toBe('found');
    if (found?.status !== 'found') return;
    expect(sourceOffset(p, found.from, 'start')).toBe(from);
    expect(sourceOffset(p, found.to, 'end')).toBe(to);
  });

  it('sin selección se cita el bloque del cursor; en una línea vacía, nada', () => {
    const p = pmProjection(Node.fromJSON(schema, content));
    const inTitle = projectionOffset(p, 3, 'start');
    expect(selectorForRange(p, inTitle, inTitle)?.start).toBe('Guion');
    const empty = p.blocks[2]!;
    expect(selectorForRange(p, empty.from, empty.from)).toBeNull();
  });

  it('un ancla repetida al partir un bloque se queda en el original', () => {
    let state = EditorState.create({
      doc: Node.fromJSON(schema, content),
      plugins: [blockAnchorsPlugin()],
    });
    const p = pmProjection(state.doc);
    const middle = sourceOffset(p, p.text.indexOf('uno'), 'start')!;
    // `tr.split` copia los atributos (el comando de Intro no, por keepOnSplit).
    state = state.apply(state.tr.split(middle));
    const anchors = pmProjection(state.doc).blocks.map((b) => b.id);
    expect(anchors.filter((id) => id === 'p1')).toHaveLength(1);
    expect(anchors[1]).toBe('p1');
  });

  it('pegar una copia del bloque antes del original no le quita el ancla al original', () => {
    let state = EditorState.create({
      doc: Node.fromJSON(schema, content),
      plugins: [blockAnchorsPlugin()],
    });
    const heading = state.doc.child(0);
    state = state.apply(state.tr.insert(0, heading.copy(heading.content)));
    const blocks = pmProjection(state.doc).blocks;
    expect(blocks.map((b) => b.id).slice(0, 2)).toEqual([null, 'tit']);
  });

  it('al guardar, solo los bloques con ancla llevan el atributo', () => {
    const json = Node.fromJSON(schema, content).toJSON() as Parameters<
      typeof withoutEmptyAnchors
    >[0];
    const text = JSON.stringify(withoutEmptyAnchors(json));
    expect(text.match(/"anchor"/g)).toHaveLength(2);
    expect(text).not.toContain('"anchor":null');
    expect(text).toContain('"level":1');
  });
});
