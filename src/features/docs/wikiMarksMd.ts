import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

/**
 * `[[Título]]` escritos a mano en un documento Markdown (plan 9.6; llegan al cancelar el selector
 * de `[[`, al pegar o al editar la copia legible fuera): se pintan como enlace con decoraciones,
 * sin cambiar el texto. `data-wiki-target` lleva el id del destino si el título es único; la vista
 * lo sigue al pulsar. Se recalculan al editar y al cambiar los títulos (transacción con metadatos).
 */
const WIKI = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;

export const wikiMarksKey = new PluginKey<DecorationSet>('wikiMarks');

function decorate(state: EditorState, resolve: (title: string) => string | null): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text?.includes('[[')) return;
    if (parent?.type.spec.code || node.marks.some((m) => m.type.spec.code)) return;
    for (const match of node.text.matchAll(WIKI)) {
      const id = resolve(match[1]!.normalize('NFC').trim());
      const from = pos + match.index;
      decorations.push(
        Decoration.inline(from, from + match[0].length, {
          class: id ? 'wiki-link' : 'wiki-link broken-link',
          ...(id ? { 'data-wiki-target': id } : {}),
        }),
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
}

/** `resolve` se lee en cada cálculo: la vista lo mantiene al día y avisa con `refreshWikiMarks`. */
export function wikiMarksPlugin(resolve: () => (title: string) => string | null): Plugin {
  return new Plugin<DecorationSet>({
    key: wikiMarksKey,
    state: {
      init: (_config, state) => decorate(state, resolve()),
      apply: (tr, set, _old, state) =>
        tr.docChanged || tr.getMeta(wikiMarksKey) ? decorate(state, resolve()) : set,
    },
    props: {
      decorations: (state) => wikiMarksKey.getState(state),
    },
  });
}
