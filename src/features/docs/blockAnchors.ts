import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';

/**
 * Anclas de bloque de los documentos con formato (formato §2.5.3): `attrs.anchor` en párrafos,
 * títulos y bloques de código, destino de los enlaces `#b=<id>`. Extensión propia en lugar de
 * UniqueID (Tiptap, MIT): aquella pone un id a todos los bloques al abrir el documento, lo que
 * crearía una revisión, y un conflicto entre dispositivos, sin que nadie edite. Aquí el id solo
 * se escribe al crear un ancla (`ensureBlockAnchor`).
 */
export const ANCHOR_TYPES = ['paragraph', 'heading', 'codeBlock'];

const key = new PluginKey('blockAnchors');

export const BlockAnchors = Extension.create({
  name: 'blockAnchors',

  addGlobalAttributes() {
    return [
      {
        types: ANCHOR_TYPES,
        attributes: {
          anchor: {
            default: null,
            // Al partir un bloque con Intro, la parte nueva no hereda el ancla.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-anchor'),
            renderHTML: (attributes) =>
              typeof attributes['anchor'] === 'string' && attributes['anchor']
                ? { 'data-anchor': attributes['anchor'] }
                : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [blockAnchorsPlugin()];
  },
});

/**
 * Un ancla es única en el documento. Si se repite (partir un bloque fuera del comando de Intro,
 * pegar un bloque dentro del mismo documento), la conserva el bloque que ya la tenía y se retira
 * de las copias.
 */
export function blockAnchorsPlugin(): Plugin {
  return new Plugin({
    key,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const before = new Map<string, number>();
      oldState.doc.descendants((node, pos) => {
        const id: unknown = node.attrs['anchor'];
        if (typeof id === 'string' && id) before.set(id, pos);
        return node.isBlock;
      });
      const mapping = new Mapping();
      for (const tr of transactions) mapping.appendMapping(tr.mapping);
      const found = new Map<string, number[]>();
      newState.doc.descendants((node, pos) => {
        const id: unknown = node.attrs['anchor'];
        if (typeof id === 'string' && id) found.set(id, [...(found.get(id) ?? []), pos]);
        return node.isBlock;
      });
      const tr = newState.tr;
      for (const [id, positions] of found) {
        if (positions.length < 2) continue;
        const previous = before.get(id);
        const original = previous === undefined ? undefined : mapping.map(previous);
        const keep = positions.includes(original ?? -1) ? original : positions[0];
        for (const pos of positions) {
          if (pos === keep) continue;
          const node = newState.doc.nodeAt(pos);
          if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, anchor: null });
        }
      }
      return tr.docChanged ? tr : null;
    },
  });
}

function newAnchorId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/**
 * Ancla del bloque de texto donde empieza la selección. Si no la tiene y `assign` lo permite, se
 * le asigna (es un cambio del documento y crea una revisión); en solo lectura no se escribe
 * nada. Null fuera de un bloque anclable o sin ancla.
 */
export function ensureBlockAnchor(editor: Editor, assign: boolean): string | null {
  const { state } = editor;
  const { $from } = state.selection;
  const node = $from.parent;
  if (!node.isTextblock || !ANCHOR_TYPES.includes(node.type.name)) return null;
  const current: unknown = node.attrs['anchor'];
  if (typeof current === 'string' && current) return current;
  if (!assign) return null;
  const id = newAnchorId();
  editor.view.dispatch(state.tr.setNodeMarkup($from.before(), undefined, { ...node.attrs, anchor: id }));
  return id;
}

/**
 * El editor serializa `anchor: null` en todos los bloques anclables. Se quita antes de guardar:
 * en el formato, el atributo solo existe en los bloques que tienen un ancla (§2.5.3).
 */
export function withoutEmptyAnchors(node: JSONContent): JSONContent {
  const { attrs, content, ...rest } = node;
  const result: JSONContent = { ...rest };
  if (attrs) {
    const { anchor, ...others } = attrs;
    const kept = anchor == null ? others : attrs;
    if (Object.keys(kept).length > 0) result.attrs = kept;
  }
  if (content) result.content = content.map(withoutEmptyAnchors);
  return result;
}
