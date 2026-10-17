import { EditorView } from 'codemirror';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadText } from '../../app/download.ts';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { useAutosave } from '../../app/useAutosave.ts';
import {
  projectionOffset,
  quoteLabel,
  resolveAnchor,
  selectorForRange,
  sourceOffset,
} from '../../domain/anchors.ts';
import { hasInternalScheme, internalLink, parseInternalLink } from '../../domain/links.ts';
import { markdownProjection } from '../../application/knowledge.ts';
import { safeFilename } from '../../application/portability.ts';
import { normalizeForSearch } from '../../application/searchIndex.ts';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import type { OpenedNote, VaultService } from '../../application/VaultService.ts';
import { isLinkableKind, type DocumentRecord } from '../../domain/revision.ts';
import { AnchorNotice, CopiedNotice, type AnchorStatus } from '../knowledge/anchorUi.tsx';
import { backlinkRanges, useBacklinkAnchors } from '../knowledge/backlinkMarks.ts';
import { useKindLabel } from '../knowledge/kindLabel.ts';
import { useSelectionLinker } from '../knowledge/useSelectionLinker.tsx';
import { backlinkMarks, setBacklinkMarks } from './backlinkMarksCm.ts';
import { linkSelection, MarkdownEditor, type LinkTarget } from './MarkdownEditor.tsx';
import { renderMarkdownPreview } from './markdown.ts';

interface Props {
  documentId: string;
  /** Título vigente, para el nombre del archivo exportado. */
  title: string;
  service: VaultService;
  /** Backlinks con ancla, para resaltar los fragmentos enlazados. */
  knowledge: KnowledgeService;
  /** FA-03a: crear la nota de destino desde el autocompletado [[. */
  onCreateNote: (title: string) => Promise<DocumentRecord>;
}

export function NoteView({ documentId, title, service, knowledge, onCreateNote }: Props) {
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
  const kindLabel = useKindLabel();
  const copyToStore = useUiStore((s) => s.copyLink);
  /** El fragmento del último enlace seguido cambió o ya no está. */
  const [anchorStatus, setAnchorStatus] = useState<AnchorStatus>(null);
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
    if (target || hasInternalScheme(href)) {
      if (target && documents.some((d) => d.id === target.documentId && !d.deleted)) {
        navigate(linkFocus(target));
      } else {
        anchor?.setAttribute('title', t('notes.brokenLink'));
        anchor?.classList.add('broken-link');
      }
      return;
    }
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  };

  // Abrir la nota desde un enlace con ancla, la búsqueda o un backlink: seleccionar y mostrar
  // el fragmento citado o el texto buscado.
  useEffect(() => {
    if (!view || focus?.documentId !== documentId) return;
    const target = useUiStore.getState().consumeFocus(documentId);
    const text = view.state.doc.toString();
    let range: { from: number; to: number } | null = null;
    if (target?.quote || target?.blockId) {
      const projection = markdownProjection(text);
      const result = resolveAnchor(projection, {
        blockId: target.blockId ?? null,
        text: target.quote ?? null,
      });
      if (result && result.status !== 'lost') {
        range = {
          from: sourceOffset(projection, result.from, 'start') ?? 0,
          to: sourceOffset(projection, result.to, 'end') ?? 0,
        };
      }
      // Sincroniza con una orden externa (la navegación), una vez por enlace seguido.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnchorStatus(!result || result.status === 'found' ? null : result.status);
    } else {
      const wanted = target?.text?.trim();
      const at = wanted ? normalizeForSearch(text).indexOf(normalizeForSearch(wanted)) : -1;
      if (wanted && at >= 0) range = { from: at, to: at + wanted.length };
    }
    if (!range) return;
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
    });
    view.focus();
  }, [view, focus, documentId]);

  /** «Copiar enlace a la selección»: cita del texto seleccionado (o del bloque del cursor). */
  const copyLink = () => {
    if (!view) return;
    const projection = markdownProjection(view.state.doc.toString());
    const { from, to } = view.state.selection.main;
    const selector = selectorForRange(
      projection,
      projectionOffset(projection, from, 'start'),
      projectionOffset(projection, to, 'end'),
    );
    copyToStore({
      url: internalLink(documentId, selector ? { text: selector } : null),
      label: selector ? quoteLabel(selector) : title,
      documentTitle: title,
    });
  };

  // Fragmentos de esta nota con backlinks: se resaltan en el editor (fase 7.F).
  const backlinkAnchors = useBacklinkAnchors(knowledge, documentId);
  useEffect(() => {
    if (!view) return;
    const ranges = backlinkRanges(markdownProjection(view.state.doc.toString()), backlinkAnchors);
    view.dispatch({
      effects: setBacklinkMarks.of(
        ranges.map((r) => ({
          ...r,
          title: t('links.linkedFrom', { sources: r.sources.join(', ') }),
        })),
      ),
    });
  }, [view, backlinkAnchors, t]);

  const findTargets = (query: string): LinkTarget[] => {
    const q = normalizeForSearch(query.trim());
    return documentsRef.current
      .filter((d) => !d.deleted && d.id !== documentId)
      .flatMap((d) => (isLinkableKind(d.kind) ? [{ id: d.id, title: d.title, kind: d.kind }] : []))
      .filter((d) => !q || normalizeForSearch(d.title).includes(q))
      .slice(0, 20);
  };

  /** «Enlazar selección»: envuelve la selección del Markdown fuente en un enlace. */
  const linker = useSelectionLinker({
    sourceId: documentId,
    service,
    onCreateNote,
    apply: (range, pick) => view && linkSelection(view, range, pick),
    onClose: () => view?.focus(),
  });
  const openLinkPicker = () => {
    if (!view || opened?.readOnly) return;
    const { from, to } = view.state.selection.main;
    linker.open({ from, to });
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
        <button
          type="button"
          className="icon-button"
          aria-label={t('links.linkSelection')}
          title={t('links.linkSelection')}
          data-testid="link-selection"
          disabled={opened.readOnly !== null}
          // Sin robar el foco al editor: la selección sigue donde estaba.
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkPicker}
        >
          <Icon name="enlace" size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('links.copyLink')}
          title={t('links.copyLink')}
          data-testid="copy-link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={copyLink}
        >
          <Icon name="duplicar" size={18} />
        </button>
        <CopiedNotice />
      </div>
      <AnchorNotice status={anchorStatus} />
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
          kindLabel={kindLabel}
          onReady={setView}
          onLinkCommand={openLinkPicker}
          onCopyLinkCommand={copyLink}
          extensions={[backlinkMarks]}
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
      {linker.picker}
    </div>
  );
}
