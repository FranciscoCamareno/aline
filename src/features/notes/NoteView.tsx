import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { useAutosave } from '../../app/useAutosave.ts';
import type { OpenedNote, VaultService } from '../../application/VaultService.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { INTERNAL_LINK_PREFIX, renderMarkdownPreview } from './markdown.ts';

interface Props {
  documentId: string;
  service: VaultService;
}

export function NoteView({ documentId, service }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<OpenedNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const documents = useUiStore((s) => s.documents);
  const setActive = useUiStore((s) => s.setActive);

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

  const previewHtml = useMemo(() => renderMarkdownPreview(body), [body]);

  // Enlaces internos se abren en la app; externos en otra pestaña sin opener (diseño §13).
  const onPreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    if (href.startsWith(INTERNAL_LINK_PREFIX)) {
      const targetId = href.slice(INTERNAL_LINK_PREFIX.length).split(/[/#?]/)[0] ?? '';
      if (documents.some((d) => d.id === targetId && !d.deleted)) setActive(targetId);
      else anchor?.setAttribute('title', t('notes.brokenLink'));
      return;
    }
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
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
