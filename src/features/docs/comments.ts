import { Mark, mergeAttributes, type Editor } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { RichNode } from '../../domain/richDoc.ts';

/**
 * Comentarios de los documentos con formato (fase 8.3). Los comentarios de Tiptap son de pago y
 * necesitan su nube, así que son propios: el texto comentado lleva la marca `comment` con el
 * `id` del hilo, y los hilos se guardan en el propio documento (`comments`, formato §2.5.3).
 *
 * La marca no tiene estilo propio: el resaltado lo pintan decoraciones, que saben qué hilos
 * están resueltos (sin resaltar) y cuál está activo.
 */

export interface CommentView {
  resolved: ReadonlySet<string>;
  active: string | null;
}

export const commentViewKey = new PluginKey<CommentView>('commentView');

/** Rango de texto de un hilo, en posiciones del documento. */
export interface CommentRange {
  id: string;
  from: number;
  to: number;
}

/** Rangos de cada hilo en el documento (un hilo puede tener varios si se pegó su texto). */
export function commentRanges(doc: PmNode): CommentRange[] {
  const ranges: CommentRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== 'comment') continue;
      const id = mark.attrs['id'] as unknown;
      if (typeof id !== 'string') continue;
      const last = ranges.findLast((r) => r.id === id);
      // Texto contiguo con la misma marca (p. ej. partido por una negrita): un solo rango.
      if (last && last.to === pos) last.to = pos + node.nodeSize;
      else ranges.push({ id, from: pos, to: pos + node.nodeSize });
    }
    return false;
  });
  return ranges;
}

export const CommentMark = Mark.create({
  name: 'comment',
  // Escribir al final del texto comentado no amplía el comentario.
  inclusive: false,
  // Comentarios que se solapan: varias marcas `comment` con ids distintos en el mismo texto.
  excludes: '',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment'),
        renderHTML: (attributes) =>
          typeof attributes['id'] === 'string' ? { 'data-comment': attributes['id'] } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentView>({
        key: commentViewKey,
        state: {
          init: () => ({ resolved: new Set(), active: null }),
          apply: (tr, value) => (tr.getMeta(commentViewKey) as CommentView | undefined) ?? value,
        },
        props: {
          decorations(state) {
            const view = commentViewKey.getState(state);
            const decorations = commentRanges(state.doc)
              .filter((r) => !view?.resolved.has(r.id))
              .map((r) =>
                Decoration.inline(r.from, r.to, {
                  class: `doc-comment${view?.active === r.id ? ' is-active' : ''}`,
                  'data-comment-id': r.id,
                }),
              );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/** Hilos resueltos y activo, para el resaltado (no cambia el documento). */
export function setCommentView(editor: Editor, view: CommentView): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(commentViewKey, view).setMeta('addToHistory', false),
  );
}

/** Señala la selección con un hilo nuevo. */
export function markComment(editor: Editor, range: { from: number; to: number }, id: string) {
  const type = editor.schema.marks['comment'];
  if (!type) return;
  editor.view.dispatch(editor.state.tr.addMark(range.from, range.to, type.create({ id })));
}

/** Quita del texto la marca de un hilo (al eliminarlo). */
export function unmarkComment(editor: Editor, id: string) {
  const type = editor.schema.marks['comment'];
  if (!type) return;
  const tr = editor.state.tr;
  for (const range of commentRanges(editor.state.doc).filter((r) => r.id === id)) {
    tr.removeMark(range.from, range.to, type.create({ id }));
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function newCommentId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Ids de los hilos citados en un contenido guardado (JSON de una pestaña). */
export function commentIdsIn(content: RichNode | undefined): Set<string> {
  const ids = new Set<string>();
  const walk = (node: RichNode) => {
    for (const mark of node.marks ?? []) {
      const id = mark.attrs?.['id'];
      if (mark.type === 'comment' && typeof id === 'string') ids.add(id);
    }
    node.content?.forEach(walk);
  };
  if (content) walk(content);
  return ids;
}

/** Copia de un contenido sin marcas de comentario ni anclas de bloque (duplicar una pestaña). */
export function withoutCommentsAndAnchors(node: RichNode): RichNode {
  const copy: RichNode = { ...node };
  if (node.marks) {
    const marks = node.marks.filter((m) => m.type !== 'comment');
    if (marks.length) copy.marks = marks;
    else delete copy.marks;
  }
  if (node.attrs && 'anchor' in node.attrs) {
    const attrs = { ...node.attrs };
    delete attrs['anchor'];
    copy.attrs = attrs;
  }
  if (node.content) copy.content = node.content.map(withoutCommentsAndAnchors);
  return copy;
}
