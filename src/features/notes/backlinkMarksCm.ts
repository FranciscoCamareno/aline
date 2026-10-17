import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { MarkRange } from '../knowledge/backlinkMarks.ts';

/** Nuevos fragmentos con backlinks, con el texto de su aviso ya traducido. */
export const setBacklinkMarks = StateEffect.define<Array<MarkRange & { title: string }>>();

/**
 * Fragmentos con backlinks en CodeMirror (fase 7.F): decoraciones que siguen al texto mientras
 * se edita y se recalculan cuando cambia el índice.
 */
export const backlinkMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setBacklinkMarks)) continue;
      const length = tr.state.doc.length;
      next = Decoration.set(
        effect.value
          .filter((r) => r.from < r.to && r.to <= length)
          .map((r) =>
            Decoration.mark({
              class: 'backlink-mark',
              attributes: { title: r.title, 'data-backlinks': String(r.sources.length) },
            }).range(r.from, r.to),
          ),
        true,
      );
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
