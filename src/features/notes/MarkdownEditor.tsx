import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useLayoutEffect, useRef } from 'react';

interface Props {
  initialValue: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Documento de versión desconocida o inválida: se muestra sin permitir cambios. */
  readOnly?: boolean;
}

/**
 * CodeMirror 6 en modo Markdown: conserva el texto fuente tal cual (diseño §10).
 * El componente no es controlado; se monta de nuevo al cambiar de documento.
 * Pendiente: sugerencias al escribir [[ (RF-21).
 */
export function MarkdownEditor({ initialValue, onChange, ariaLabel, readOnly = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const view = new EditorView({
      parent,
      doc: initialValue,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    return () => view.destroy();
    // initialValue, ariaLabel y readOnly solo se usan al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="markdown-editor" ref={hostRef} data-testid="note-editor" />;
}
