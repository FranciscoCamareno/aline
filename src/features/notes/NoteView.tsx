import { EditorView } from 'codemirror';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadText } from '../../app/download.ts';
import { useUiStore } from '../../app/store.ts';
import { useAutosave } from '../../app/useAutosave.ts';
import { parseInternalLink } from '../../application/knowledge.ts';
import { safeFilename } from '../../application/portability.ts';
import { normalizeForSearch } from '../../application/searchIndex.ts';
import type { OpenedNote, VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { MarkdownEditor, type LinkTarget } from './MarkdownEditor.tsx';
import { renderMarkdownPreview } from './markdown.ts';

interface Props {
  documentId: string;
  /** Título vigente, para el nombre del archivo exportado. */
  title: string;
  service: VaultService;
  /** FA-03a: crear la nota de destino desde el autocompletado [[. */
  onCreateNote: (title: string) => Promise<DocumentRecord>;
}

export function NoteView({ documentId, title, service, onCreateNote }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<OpenedNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const documents = useUiStore((s) => s.documents);
  const navigate = useUiStore((s) => s.navigate);
  const focus = useUiStore((s) => s.focus);
  /** Las órdenes anteriores al montaje no se ejecutan. */
  const handledCommand = useRef(useUiStore.getState().viewCommand?.seq ?? 0);
  const [view, setView] = useState<EditorView | null>(null);
  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    let cancelled = false;
    service
      .openNote(documentId)
      .then((note) => {
        if (cancelled) return;
        setOpened(note);
        setBody(note.body);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, service]);

  const session = opened?.session;
  const autosave = useAutosave<string>((value) => {
    if (!session) return Promise.reject(new Error('Nota no cargada'));
    return service.saveNote(session, value);
  });

  // «Exportar → Markdown» de la cabecera. Lo escrito y aún no guardado se guarda antes: se
  // exporta la versión vigente.
  useEffect(
    () =>
      useUiStore.subscribe(({ viewCommand }) => {
        if (viewCommand?.documentId !== documentId || viewCommand.kind !== 'export') return;
        if (viewCommand.seq <= handledCommand.current) return;
        handledCommand.current = viewCommand.seq;
        void (autosave.pending ? autosave.flush() : Promise.resolve())
          .then(() => service.exportNoteMarkdown(documentId))
          .then((markdown) =>
            downloadText(safeFilename(title, 'md'), markdown, 'text/markdown;charset=utf-8'),
          );
      }),
    [autosave, documentId, service, title],
  );

  const previewHtml = useMemo(() => renderMarkdownPreview(body), [body]);

  // Enlaces internos se abren en la app; externos en otra pestaña sin opener (diseño §13).
  const onPreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    const target = parseInternalLink(href);
    if (target || href.startsWith('mindnote:')) {
      if (target && documents.some((d) => d.id === target.documentId && !d.deleted)) {
        navigate({ documentId: target.documentId, elementId: target.elementId });
      } else {
        anchor?.setAttribute('title', t('notes.brokenLink'));
        anchor?.classList.add('broken-link');
      }
      return;
    }
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  };

  // Abrir la nota desde la búsqueda o un backlink: seleccionar y mostrar el texto buscado.
  useEffect(() => {
    if (!view || focus?.documentId !== documentId) return;
    const target = useUiStore.getState().consumeFocus(documentId);
    const wanted = target?.text?.trim();
    if (!wanted) return;
    const text = view.state.doc.toString();
    const at = normalizeForSearch(text).indexOf(normalizeForSearch(wanted));
    if (at < 0) return;
    view.dispatch({
      selection: { anchor: at, head: at + wanted.length },
      effects: EditorView.scrollIntoView(at, { y: 'center' }),
    });
    view.focus();
  }, [view, focus, documentId]);

  const findTargets = (query: string): LinkTarget[] => {
    const q = normalizeForSearch(query.trim());
    return documentsRef.current
      .filter((d) => !d.deleted && d.kind !== 'folder' && d.id !== documentId)
      .filter((d) => !q || normalizeForSearch(d.title).includes(q))
      .slice(0, 20)
      .map((d) => ({ id: d.id, title: d.title, kind: d.kind === 'canvas' ? 'canvas' : 'note' }));
  };

  if (loadError)
    return (
      <div className="view-message" role="alert">
        {loadError}
      </div>
    );
  if (!opened) return <div className="view-message" aria-busy="true" />;

  return (
    <div className={`note-view ${showPreview ? 'with-preview' : ''}`}>
      {opened.readOnly && (
        <p className="notice" role="alert" data-testid="read-only-notice">
          {t(`readOnly.${opened.readOnly}`)}
        </p>
      )}
      {opened.frontmatterInvalid && (
        <p className="notice" role="status">
          {t('notes.invalidFrontmatter')}
        </p>
      )}
      <div className="note-toolbar">
        <button type="button" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
          {showPreview ? t('notes.hidePreview') : t('notes.showPreview')}
        </button>
      </div>
      <div className="note-panes">
        <MarkdownEditor
          initialValue={opened.body}
          ariaLabel={t('notes.editor')}
          readOnly={opened.readOnly !== null}
          findTargets={findTargets}
          onCreateTarget={async (title) => {
            const doc = await onCreateNote(title);
            return { id: doc.id, title: doc.title, kind: 'note' };
          }}
          createLabel={(title) => t('links.createNote', { title })}
          kindLabel={(kind) =>
            kind === 'canvas' ? t('library.kindCanvas') : t('library.kindNote')
          }
          onReady={setView}
          onChange={(value) => {
            setBody(value);
            autosave.push(value);
          }}
        />
        {showPreview && (
          <div
            className="markdown-preview"
            aria-label={t('notes.preview')}
            data-testid="note-preview"
            onClick={onPreviewClick}
            // HTML saneado con rehype-sanitize; HTML crudo desactivado en el parser.
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  );
}
