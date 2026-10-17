import { EditorState as CmState } from '@codemirror/state';
import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { EditorState as PmState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { markdownProjection } from '../../src/application/knowledge.ts';
import {
  tiptapBacklinkKey,
  tiptapBacklinkPlugin,
} from '../../src/features/docs/backlinkMarksPm.ts';
import { BlockAnchors } from '../../src/features/docs/blockAnchors.ts';
import { backlinkRanges } from '../../src/features/knowledge/backlinkMarks.ts';
import { pmProjection } from '../../src/features/knowledge/pmProjection.ts';
import { backlinkMarks, setBacklinkMarks } from '../../src/features/notes/backlinkMarksCm.ts';

const quote = (start: string) => ({ prefix: '', start, end: '', suffix: '' });

describe('resaltado de los fragmentos con backlinks (fase 7.F)', () => {
  it('calcula los rangos en el Markdown fuente y descarta lo que no se encuentra', () => {
    const body = 'Intro.\n\nEl **plan B** sale el lunes.';
    const ranges = backlinkRanges(markdownProjection(body), [
      { blockId: null, quote: quote('plan B sale'), sources: ['Notas', 'Guion'] },
      { blockId: null, quote: quote('no está'), sources: ['Otra'] },
    ]);
    expect(ranges).toHaveLength(1);
    expect(body.slice(ranges[0]!.from, ranges[0]!.to)).toBe('plan B** sale');
    expect(ranges[0]!.sources).toEqual(['Notas', 'Guion']);
  });

  it('en CodeMirror, la marca sigue al texto al escribir antes y no cambia el documento', () => {
    let state = CmState.create({ doc: 'Hola mundo', extensions: [backlinkMarks] });
    state = state.update({
      effects: setBacklinkMarks.of([
        { from: 5, to: 10, sources: ['A'], title: 'Enlazado desde: A' },
      ]),
    }).state;
    expect(state.doc.toString()).toBe('Hola mundo');
    state = state.update({ changes: { from: 0, insert: '¡' } }).state;
    const field = state.field(backlinkMarks);
    const found: Array<[number, number]> = [];
    field.between(0, state.doc.length, (from, to) => void found.push([from, to]));
    expect(found).toEqual([[6, 11]]);
  });

  it('en Tiptap, bloque anclado y cita se marcan y siguen al texto al editar', () => {
    const schema = getSchema([StarterKit, BlockAnchors]);
    const doc = Node.fromJSON(schema, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Primero.' }] },
        {
          type: 'paragraph',
          attrs: { anchor: 'p2' },
          content: [{ type: 'text', text: 'Decidimos usar IndexedDB.' }],
        },
      ],
    });
    let state = PmState.create({ doc, plugins: [tiptapBacklinkPlugin()] });
    const ranges = backlinkRanges(pmProjection(state.doc), [
      { blockId: 'p2', quote: quote('usar IndexedDB'), sources: ['Notas'] },
    ]).map((r) => ({ ...r, title: 'Enlazado desde: Notas' }));
    state = state.apply(state.tr.setMeta(tiptapBacklinkKey, ranges));
    const marked = () =>
      tiptapBacklinkKey
        .getState(state)!
        .find()
        .map((d) => state.doc.textBetween(d.from, d.to));
    expect(marked()).toEqual(['usar IndexedDB']);
    state = state.apply(state.tr.insertText('Antes: ', 1));
    expect(marked()).toEqual(['usar IndexedDB']);
  });
});
