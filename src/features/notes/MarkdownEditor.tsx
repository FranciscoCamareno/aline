import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { internalLink } from '../../application/knowledge.ts';

/**
 * Resaltado del Markdown con los tokens de la interfaz (docs/DESIGN.md §2): sigue al tema sin
 * recrear el editor. Sustituye al estilo por defecto de CodeMirror, pensado para fondo blanco.
 */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--link)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' },
  { tag: tags.quote, color: 'var(--text-secondary)' },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
    color: 'var(--text-secondary)',
  },
]);

export interface LinkTarget {
  id: string;
  title: string;
  kind: 'note' | 'canvas';
}

interface Props {
  initialValue: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Documento de versión desconocida o inválida: se muestra sin permitir cambios. */
  readOnly?: boolean;
  /** Destinos para el autocompletado `[[` (RF-21). */
  findTargets?: (query: string) => LinkTarget[];
  /** FA-03a: crear la nota de destino desde el autocompletado. */
  onCreateTarget?: (title: string) => Promise<LinkTarget>;
  createLabel?: (title: string) => string;
  kindLabel?: (kind: LinkTarget['kind']) => string;
  onReady?: (view: EditorView) => void;
}

/** Texto de enlace Markdown seguro: se escapan los corchetes y la barra invertida. */
export function markdownLink(target: Pick<LinkTarget, 'id' | 'title'>): string {
  const text = target.title.replace(/[\\[\]]/g, (c) => `\\${c}`);
  return `[${text}](${internalLink(target.id)})`;
}

/**
 * CodeMirror 6 en modo Markdown: conserva el texto fuente tal cual (diseño §10).
 * El componente no es controlado; se monta de nuevo al cambiar de documento.
 * Al escribir `[[` sugiere destinos por título e inserta un enlace Markdown con UUID (§5.1).
 */
export function MarkdownEditor({
  initialValue,
  onChange,
  ariaLabel,
  readOnly = false,
  findTargets,
  onCreateTarget,
  createLabel,
  kindLabel,
  onReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onChange, findTargets, onCreateTarget, createLabel, kindLabel, onReady });
  useLayoutEffect(() => {
    latest.current = { onChange, findTargets, onCreateTarget, createLabel, kindLabel, onReady };
  });

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const wikiCompletion = (context: CompletionContext): CompletionResult | null => {
      const match = context.matchBefore(/\[\[[^\]\n]*/);
      const {
        findTargets: find,
        onCreateTarget: create,
        createLabel: label,
        kindLabel: kind,
      } = latest.current;
      if (!match || !find) return null;
      const query = match.text.slice(2);
      // Con autocierre de corchetes, tras el cursor quedan «]]» que el enlace sustituye.
      const end = (view: EditorView, to: number) =>
        view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to;
      const insert = (view: EditorView, from: number, to: number, target: LinkTarget) => {
        const text = markdownLink(target);
        view.dispatch({
          changes: { from, to: end(view, to), insert: text },
          selection: { anchor: from + text.length },
        });
      };
      const options: Completion[] = find(query).map((target) => ({
        label: target.title,
        detail: kind?.(target.kind) ?? target.kind,
        apply: (view, _completion, from, to) => insert(view, from, to, target),
      }));
      if (query.trim() && create) {
        options.push({
          label: label?.(query.trim()) ?? `+ ${query.trim()}`,
          apply: (view, _completion, from, to) => {
            void create(query.trim()).then((target) => insert(view, from, to, target));
          },
        });
      }
      return { from: match.from, options, filter: false };
    };

    const view = new EditorView({
      parent,
      doc: initialValue,
      extensions: [
        basicSetup,
        syntaxHighlighting(markdownHighlight),
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorState.languageData.of(() => [{ autocomplete: wikiCompletion }]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange(update.state.doc.toString());
        }),
      ],
    });
    latest.current.onReady?.(view);
    return () => view.destroy();
    // initialValue, ariaLabel y readOnly solo se usan al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="markdown-editor" ref={hostRef} data-testid="note-editor" />;
}
