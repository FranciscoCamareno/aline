import { Plugin as MilkdownPlugin, PluginKey as MilkdownKey } from '@milkdown/prose/state';
import {
  Decoration as MilkdownDecoration,
  DecorationSet as MilkdownSet,
} from '@milkdown/prose/view';
import { Plugin as TiptapPlugin, PluginKey as TiptapKey } from '@tiptap/pm/state';
import {
  Decoration as TiptapDecoration,
  DecorationSet as TiptapSet,
} from '@tiptap/pm/view';
import type { MarkRange } from '../knowledge/backlinkMarks.ts';

/**
 * Fragmentos con backlinks en los editores ProseMirror (fase 7.F). Tiptap y Milkdown traen cada
 * uno su copia de ProseMirror y sus clases no se pueden mezclar, así que hay un plugin por
 * editor; los dos hacen lo mismo: decoraciones que siguen al texto al editar y se sustituyen al
 * recibir rangos nuevos (una transacción solo con metadatos, que no cambia el documento).
 */
export type TitledRange = MarkRange & { title: string };

const attrs = (r: TitledRange) => ({
  class: 'backlink-mark',
  title: r.title,
  'data-backlinks': String(r.sources.length),
});

const valid = (ranges: TitledRange[], size: number) =>
  ranges.filter((r) => r.from < r.to && r.to <= size);

export const tiptapBacklinkKey = new TiptapKey<TiptapSet>('backlinkMarks');

export function tiptapBacklinkPlugin(): TiptapPlugin {
  return new TiptapPlugin<TiptapSet>({
    key: tiptapBacklinkKey,
    state: {
      init: () => TiptapSet.empty,
      apply(tr, set) {
        const ranges = tr.getMeta(tiptapBacklinkKey) as TitledRange[] | undefined;
        if (!ranges) return set.map(tr.mapping, tr.doc);
        return TiptapSet.create(
          tr.doc,
          valid(ranges, tr.doc.content.size).map((r) =>
            TiptapDecoration.inline(r.from, r.to, attrs(r)),
          ),
        );
      },
    },
    props: {
      decorations: (state) => tiptapBacklinkKey.getState(state),
    },
  });
}

export const milkdownBacklinkKey = new MilkdownKey<MilkdownSet>('backlinkMarks');

export function milkdownBacklinkPlugin(): MilkdownPlugin {
  return new MilkdownPlugin<MilkdownSet>({
    key: milkdownBacklinkKey,
    state: {
      init: () => MilkdownSet.empty,
      apply(tr, set) {
        const ranges = tr.getMeta(milkdownBacklinkKey) as TitledRange[] | undefined;
        if (!ranges) return set.map(tr.mapping, tr.doc);
        return MilkdownSet.create(
          tr.doc,
          valid(ranges, tr.doc.content.size).map((r) =>
            MilkdownDecoration.inline(r.from, r.to, attrs(r)),
          ),
        );
      },
    },
    props: {
      decorations: (state) => milkdownBacklinkKey.getState(state),
    },
  });
}
