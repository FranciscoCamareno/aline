import {
  EditorContent,
  Extension,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { useAutosave } from '../../app/useAutosave.ts';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import type { OpenedRichDoc, VaultService } from '../../application/VaultService.ts';
import type { ReadOnlyReason } from '../../domain/compat.ts';
import {
  projectionOffset,
  quoteLabel,
  resolveAnchor,
  selectorForRange,
  sourceOffset,
} from '../../domain/anchors.ts';
import { internalLink, parseInternalLink } from '../../domain/links.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import type { RichDocData } from '../../domain/richDoc.ts';
import { AnchorNotice, CopiedNotice, type AnchorStatus } from '../knowledge/anchorUi.tsx';
import { backlinkRanges, useBacklinkAnchors } from '../knowledge/backlinkMarks.ts';
import { pmProjection } from '../knowledge/pmProjection.ts';
import {
  isCopyLinkShortcut,
  isLinkShortcut,
  useSelectionLinker,
} from '../knowledge/useSelectionLinker.tsx';
import { tiptapBacklinkKey, tiptapBacklinkPlugin } from './backlinkMarksPm.ts';
import { BlockAnchors, ensureBlockAnchor, withoutEmptyAnchors } from './blockAnchors.ts';
import { LayoutToggle, useDocLayout } from './layout.tsx';
import { BlockStyleSelect, ToolIconButton, ToolMarkButton, type BlockStyle } from './toolbar.tsx';

interface Props {
  documentId: string;
  service: VaultService;
  /** Backlinks con ancla, para resaltar los fragmentos enlazados. */
  knowledge: KnowledgeService;
  /** FA-03a: crear la nota de destino desde «Enlazar selección». */
  onCreateNote: (title: string) => Promise<DocumentRecord>;
}

/** Decoraciones de los fragmentos con backlinks (fase 7.F). */
const BacklinkMarks = Extension.create({
  name: 'backlinkMarks',
  addProseMirrorPlugins: () => [tiptapBacklinkPlugin()],
});

/**
 * Documento con formato (kind `doc`) editado con Tiptap. Cada cambio pasa por el guardado
 * automático y es una revisión nueva (VaultService.saveRichDoc). Sin extensión de imágenes ni
 * incrustados: lo pegado desde la web no descarga nada (diseño §13).
 */
export function DocView({ documentId, service, knowledge, onCreateNote }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<OpenedRichDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    service.openRichDoc(documentId).then(
      (doc) => !cancelled && setOpened(doc),
      (error: unknown) =>
        !cancelled && setLoadError(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [documentId, service]);

  if (loadError)
    return (
      <div className="view-message" role="alert">
        {loadError}
      </div>
    );
  if (!opened) return <div className="view-message" aria-busy="true" />;
  return (
    <DocEditor
      opened={opened}
      service={service}
      knowledge={knowledge}
      onCreateNote={onCreateNote}
      placeholder={t('docs.placeholder')}
    />
  );
}

function DocEditor({
  opened,
  service,
  knowledge,
  onCreateNote,
  placeholder,
}: {
  opened: OpenedRichDoc;
  service: VaultService;
  knowledge: KnowledgeService;
  onCreateNote: (title: string) => Promise<DocumentRecord>;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const navigate = useUiStore((s) => s.navigate);
  /** «Enlazar selección» vigente, para el atajo del editor (que se crea una sola vez). */
  const openLinkRef = useRef<() => void>(() => undefined);
  const copyLinkRef = useRef<() => void>(() => undefined);
  const focus = useUiStore((s) => s.focus);
  const [arrivedByLink] = useState(() => {
    const pending = useUiStore.getState().focus;
    return pending?.documentId === opened.document.id && Boolean(pending.quote || pending.blockId);
  });
  const copyToStore = useUiStore((s) => s.copyLink);
  /** El fragmento del último enlace seguido cambió o ya no está. */
  const [anchorStatus, setAnchorStatus] = useState<AnchorStatus>(null);
  const [layout, setLayout] = useDocLayout();
  /** El editor rechazó el contenido guardado: se muestra sin guardar para no perder nada. */
  const [contentError, setContentError] = useState(false);
  const readOnly: ReadOnlyReason | null =
    opened.readOnly ?? (contentError ? 'invalid-content' : null);

  const autosave = useAutosave<RichDocData['content']>((content) =>
    service.saveRichDoc(opened.session, content, opened.doc),
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // El editor no abre los enlaces (lo hace onClick); se admiten http(s), mailto y los
        // internos (aline:, y el esquema anterior mindnote:).
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
          isAllowedUri: (url) => /^(https?:|mailto:|aline:|mindnote:)/i.test(url),
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      BlockAnchors,
      BacklinkMarks,
    ],
    content: opened.doc.content as JSONContent,
    editable: opened.readOnly === null,
    // Al abrir, el cursor va al final para poder escribir sin hacer clic; si se llega por un
    // enlace, no: la selección es la del fragmento enlazado (el autofoco llegaría después).
    autofocus: opened.readOnly === null && !arrivedByLink ? 'end' : false,
    enableContentCheck: true,
    onContentError: ({ editor: instance }) => {
      setContentError(true);
      instance.setEditable(false);
    },
    editorProps: {
      attributes: {
        class: 'doc-content',
        'aria-label': t('docs.editor'),
        'data-testid': 'doc-editor',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        const action = isCopyLinkShortcut(event)
          ? copyLinkRef.current
          : isLinkShortcut(event)
            ? openLinkRef.current
            : null;
        if (!action) return false;
        event.preventDefault();
        action();
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (!instance.isEditable) return;
      autosave.push(withoutEmptyAnchors(instance.getJSON()) as RichDocData['content']);
    },
  });

  /** «Enlazar selección»: marca `link` sobre la selección, o el título enlazado si no hay texto. */
  const linker = useSelectionLinker({
    sourceId: opened.document.id,
    service,
    onCreateNote,
    apply: (range, pick) => {
      if (!editor) return;
      const size = editor.state.doc.content.size;
      const from = Math.min(range.from, size);
      const to = Math.min(range.to, size);
      const chain = editor.chain().focus();
      if (editor.state.doc.textBetween(from, to).trim()) {
        chain.setTextSelection({ from, to }).setLink({ href: pick.url }).run();
      } else {
        chain
          .insertContentAt(to, {
            type: 'text',
            text: pick.title,
            marks: [{ type: 'link', attrs: { href: pick.url } }],
          })
          .run();
      }
    },
    onClose: () => editor?.commands.focus(),
  });
  const openLink = () => {
    if (!editor || readOnly !== null) return;
    const { from, to } = editor.state.selection;
    linker.open({ from, to });
  };
  /**
   * «Copiar enlace a la selección»: id del bloque (se asigna si no lo tiene) y cita del texto
   * seleccionado. Sin selección, el enlace apunta al bloque entero.
   */
  const copyLink = () => {
    if (!editor) return;
    const blockId = ensureBlockAnchor(editor, readOnly === null);
    const { state } = editor;
    const projection = pmProjection(state.doc);
    const from = projectionOffset(projection, state.selection.from, 'start');
    const to = projectionOffset(projection, state.selection.to, 'end');
    const selector = from < to || !blockId ? selectorForRange(projection, from, to) : null;
    const block = projection.blocks.find((b) => b.id === blockId);
    const blockText = block ? projection.text.slice(block.from, block.to).trim() : '';
    const title =
      documents.find((d) => d.id === opened.document.id)?.title ?? opened.document.title;
    copyToStore({
      url: internalLink(opened.document.id, { blockId, text: selector }),
      label: selector
        ? quoteLabel(selector)
        : blockText
          ? blockText.slice(0, 60) + (blockText.length > 60 ? '…' : '')
          : title,
      documentTitle: title,
    });
  };
  useEffect(() => {
    openLinkRef.current = openLink;
    copyLinkRef.current = copyLink;
  });

  // Fragmentos de este documento con backlinks: se resaltan en el editor (fase 7.F).
  const backlinkAnchors = useBacklinkAnchors(knowledge, opened.document.id);
  useEffect(() => {
    if (!editor) return;
    const ranges = backlinkRanges(pmProjection(editor.state.doc), backlinkAnchors).map((r) => ({
      ...r,
      title: t('links.linkedFrom', { sources: r.sources.join(', ') }),
    }));
    editor.view.dispatch(
      editor.state.tr.setMeta(tiptapBacklinkKey, ranges).setMeta('addToHistory', false),
    );
  }, [editor, backlinkAnchors, t]);

  // Seguir un enlace con ancla a este documento: seleccionar y mostrar el fragmento.
  useEffect(() => {
    if (!editor || focus?.documentId !== opened.document.id) return;
    const target = useUiStore.getState().consumeFocus(opened.document.id);
    // Un texto buscado (búsqueda, backlinks) se busca como una cita, sin aviso si no está.
    const searched = target?.text?.trim();
    const quote =
      target?.quote ?? (searched ? { prefix: '', start: searched, end: '', suffix: '' } : null);
    if (!target || (!quote && !target.blockId)) return;
    const fromLink = Boolean(target.quote || target.blockId);
    const projection = pmProjection(editor.state.doc);
    const result = resolveAnchor(projection, {
      blockId: target.blockId ?? null,
      text: quote,
    });
    // Sincroniza con una orden externa (la navegación), una vez por enlace seguido.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchorStatus(!fromLink || !result || result.status === 'found' ? null : result.status);
    if (!result || result.status === 'lost') return;
    const from = sourceOffset(projection, result.from, 'start');
    const to = sourceOffset(projection, result.to, 'end');
    if (from === null || to === null) return;
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  }, [editor, focus, opened.document.id]);

  /** Enlaces: los internos se abren en la app; los externos solo con Ctrl/⌘ y sin opener. */
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    const target = parseInternalLink(href);
    if (target) {
      if (documents.some((d) => d.id === target.documentId && !d.deleted)) {
        navigate(linkFocus(target));
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && /^https?:/i.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={`doc-view layout-${layout}`} data-testid="doc-view">
      {readOnly && (
        <p className="notice" role="alert" data-testid="read-only-notice">
          {t(`readOnly.${readOnly}`)}
        </p>
      )}
      <AnchorNotice status={anchorStatus} />
      <div className="doc-toolbar" role="toolbar" aria-label={t('docs.toolbar')}>
        {editor && (
          <FormatControls
            editor={editor}
            disabled={readOnly !== null}
            onLink={openLink}
            onCopyLink={copyLink}
          />
        )}
        <span className="doc-toolbar-spacer" />
        <LayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div className="doc-scroll">
        <div className="doc-sheet" onClick={onClick}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {linker.picker}
    </div>
  );
}

/** Botones de formato. Su estado (activo o no) se lee del editor en cada transacción. */
function FormatControls({
  editor,
  disabled,
  onLink,
  onCopyLink,
}: {
  editor: Editor;
  disabled: boolean;
  onLink: () => void;
  onCopyLink: () => void;
}) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph') as BlockStyle,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  const setBlock = (block: BlockStyle) => {
    if (block === 'paragraph') chain().setParagraph().run();
    else chain().setHeading({ level: Number(block.slice(1)) as 1 | 2 | 3 }).run();
  };

  return (
    <>
      <div className="doc-toolbar-group">
        <ToolIconButton
          id="undo"
          icon="deshacer"
          label={t('docs.undo')}
          disabled={disabled || !state.canUndo}
          onRun={() => chain().undo().run()}
        />
        <ToolIconButton
          id="redo"
          icon="rehacer"
          label={t('docs.redo')}
          disabled={disabled || !state.canRedo}
          onRun={() => chain().redo().run()}
        />
      </div>
      <div className="doc-toolbar-group">
        <BlockStyleSelect value={state.block} disabled={disabled} onChange={setBlock} />
      </div>
      <div className="doc-toolbar-group">
        <ToolMarkButton
          id="bold"
          letter="B"
          label={t('docs.bold')}
          active={state.bold}
          disabled={disabled}
          onRun={() => chain().toggleBold().run()}
        />
        <ToolMarkButton
          id="italic"
          letter="I"
          label={t('docs.italic')}
          active={state.italic}
          disabled={disabled}
          onRun={() => chain().toggleItalic().run()}
        />
        <ToolMarkButton
          id="underline"
          letter="U"
          label={t('docs.underline')}
          active={state.underline}
          disabled={disabled}
          onRun={() => chain().toggleUnderline().run()}
        />
        <ToolMarkButton
          id="strike"
          letter="S"
          label={t('docs.strike')}
          active={state.strike}
          disabled={disabled}
          onRun={() => chain().toggleStrike().run()}
        />
      </div>
      <div className="doc-toolbar-group">
        <ToolIconButton
          id="align-left"
          icon="alinear-izq"
          label={t('docs.alignLeft')}
          active={state.left}
          disabled={disabled}
          onRun={() => chain().setTextAlign('left').run()}
        />
        <ToolIconButton
          id="align-center"
          icon="alinear-centro"
          label={t('docs.alignCenter')}
          active={state.center}
          disabled={disabled}
          onRun={() => chain().setTextAlign('center').run()}
        />
        <ToolIconButton
          id="align-right"
          icon="alinear-der"
          label={t('docs.alignRight')}
          active={state.right}
          disabled={disabled}
          onRun={() => chain().setTextAlign('right').run()}
        />
      </div>
      <div className="doc-toolbar-group">
        <ToolIconButton
          id="bullet-list"
          icon="lista"
          label={t('docs.bulletList')}
          active={state.bulletList}
          disabled={disabled}
          onRun={() => chain().toggleBulletList().run()}
        />
        <ToolIconButton
          id="ordered-list"
          icon="lista-numerada"
          label={t('docs.orderedList')}
          active={state.orderedList}
          disabled={disabled}
          onRun={() => chain().toggleOrderedList().run()}
        />
        <ToolIconButton
          id="blockquote"
          icon="cita"
          label={t('docs.blockquote')}
          active={state.blockquote}
          disabled={disabled}
          onRun={() => chain().toggleBlockquote().run()}
        />
      </div>
      <div className="doc-toolbar-group">
        <ToolIconButton
          id="link"
          icon="enlace"
          label={t('links.linkSelection')}
          disabled={disabled}
          onRun={onLink}
        />
        <ToolIconButton
          id="copy-link"
          icon="duplicar"
          label={t('links.copyLink')}
          onRun={onCopyLink}
        />
        <CopiedNotice />
      </div>
    </>
  );
}
