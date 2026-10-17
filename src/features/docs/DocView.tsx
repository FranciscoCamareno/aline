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
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
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
import {
  assembleRichDoc,
  contentProjection,
  docTabs,
  emptyRichDoc,
  type DocComment,
  type RichDocData,
  type RichNode,
} from '../../domain/richDoc.ts';
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
import { FontFamilyPicker, FontSizeControl } from './fontControls.tsx';
import { parsePx } from './typography.ts';
import { fontStack } from '../../app/fontCatalog.ts';
import { DocTabsPanel, useDocZoom, useOutlineOpen, ZoomSelect } from './docPanels.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { commentIdsIn, CommentMark, setCommentView, withoutCommentsAndAnchors } from './comments.ts';
import { DocImage, DocImageStore, IMAGE_ACCEPT, imageFiles } from './docImages.ts';
import { browserDocxImage, docxBlob } from './exportDocx.ts';
import { printRichDoc } from './printDoc.ts';
import { SelectionBubble } from './SelectionBubble.tsx';
import { downloadBlob } from '../../app/download.ts';
import { safeFilename } from '../../application/portability.ts';
import { CommentsPanel } from './CommentsPanel.tsx';
import { domSelectionRange } from './domSelection.ts';
import { LayoutToggle, useDocLayout } from './layout.tsx';
import { Pagination, paginationKey, setPagination } from './pagination.ts';
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
  // Imágenes (fase 8.4): las nuevas se guardan con el documento; las URL locales se liberan al
  // cerrarlo.
  const images = useMemo(
    () => new DocImageStore((hash) => service.loadAsset(hash)),
    [service],
  );
  useEffect(() => () => images.dispose(), [images]);
  const imageInput = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState(false);
  const [exportError, setExportError] = useState(false);
  /** Las órdenes de la cabecera anteriores al montaje no se ejecutan. */
  const handledCommand = useRef(useUiStore.getState().viewCommand?.seq ?? 0);
  const [zoom, setZoom] = useDocZoom();
  const [outlineOpen, setOutlineOpen] = useOutlineOpen();
  /** El editor rechazó el contenido guardado: se muestra sin guardar para no perder nada. */
  const [contentError, setContentError] = useState(false);
  const readOnly: ReadOnlyReason | null =
    opened.readOnly ?? (contentError ? 'invalid-content' : null);

  // Pestañas (como Google Docs): la lista (orden y títulos), la principal (su contenido es el
  // `content` raíz) y el contenido de cada una. El editor muestra la activa y se vuelve a crear
  // al cambiar de pestaña, así el deshacer de una no se mezcla con otra.
  const [initialTabs] = useState(() => docTabs(opened.doc));
  const [tabs, setTabs] = useState(() => initialTabs.map(({ id, title }) => ({ id, title })));
  const tabsRef = useRef(tabs);
  const mainTabRef = useRef(initialTabs.find((tab) => tab.main)?.id ?? initialTabs[0]!.id);
  const contents = useRef(new Map(initialTabs.map((tab) => [tab.id, tab.content])));
  const [activeTab, setActiveTab] = useState(initialTabs[0]!.id);
  /** Contenido con que se crea el editor de la pestaña activa. */
  const [editorContent, setEditorContent] = useState(initialTabs[0]!.content);
  const activeTabRef = useRef(activeTab);

  // Comentarios (fase 8.3): se guardan con el contenido, en la misma revisión.
  const [comments, setComments] = useState<DocComment[]>(() => opened.doc.comments ?? []);
  const commentsRef = useRef(comments);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<{ from: number; to: number } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(() => (opened.doc.comments ?? []).length > 0);
  const commentRef = useRef<() => void>(() => undefined);
  /** Insertar imágenes vigente, para pegar y arrastrar (el editor se crea una sola vez). */
  const insertImagesRef = useRef<(files: File[], at?: number) => Promise<void>>(async () => {});

  // Se guarda el documento entero: pestañas, contenido de cada una y comentarios.
  const autosave = useAutosave<RichDocData>((doc) =>
    service.saveRichDoc(opened.session, doc.content, doc, images.newAssets()),
  );
  /** El documento a guardar con lo que hay ahora (la pestaña activa, del editor). */
  const buildDoc = (): RichDocData =>
    assembleRichDoc(
      opened.doc,
      tabsRef.current.map((tab) => ({
        ...tab,
        content: contents.current.get(tab.id) ?? emptyRichDoc().content,
      })),
      mainTabRef.current,
      commentsRef.current,
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
      // Fuente y tamaño por fragmento (fase 8.2): una marca `textStyle` con `fontFamily` y
      // `fontSize` (formato §2.5.3). Las fuentes son las del catálogo, servidas en local.
      TextStyle,
      FontFamily,
      FontSize,
      // Comentarios (fase 8.3): marca `comment` con el id del hilo.
      CommentMark,
      // Imágenes del almacén (fase 8.4), pintadas con URL locales.
      DocImage.configure({ store: images }),
      // Páginas de la vista «Hoja» (fase 8.3): decoraciones, el documento no cambia.
      Pagination.configure({ pageLabel: (page) => t('docs.pageLabel', { page }) }),
    ],
    content: editorContent as JSONContent,
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
      // Pegar o arrastrar imágenes del equipo las añade al documento (nunca desde la web).
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        void insertImagesRef.current(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImagesRef.current(files, at);
        return true;
      },
      handleKeyDown: (_view, event) => {
        // Ctrl/⌘+Alt+M: comentar la selección (el atajo de los procesadores de texto).
        if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyM') {
          event.preventDefault();
          commentRef.current();
          return true;
        }
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
      contents.current.set(
        activeTabRef.current,
        withoutEmptyAnchors(instance.getJSON()) as RichDocData['content'],
      );
      autosave.push(buildDoc());
    },
    // Un editor por pestaña: se crea de nuevo al cambiar de pestaña.
  }, [activeTab]);

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
  /** Sincroniza la selección con el DOM antes de usarla (ver domSelection.ts). */
  const syncSelection = () => {
    if (!editor) return;
    const dom = domSelectionRange(editor.view);
    const { from, to } = editor.state.selection;
    if (dom && (dom.from !== from || dom.to !== to)) {
      editor.commands.setTextSelection({ from: dom.from, to: dom.to });
    }
  };
  const openLink = () => {
    if (!editor || readOnly !== null) return;
    syncSelection();
    const { from, to } = editor.state.selection;
    linker.open({ from, to });
  };
  /**
   * «Copiar enlace a la selección»: id del bloque (se asigna si no lo tiene) y cita del texto
   * seleccionado. Sin selección, el enlace apunta al bloque entero.
   */
  const copyLink = () => {
    if (!editor) return;
    syncSelection();
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

  /**
   * Inserta imágenes del equipo (botón, pegar o arrastrar) en `at` o en la selección. Las que no
   * son imágenes admitidas (tipo o tamaño) se descartan con un aviso.
   */
  async function insertImages(files: File[], at?: number) {
    if (!editor || readOnly !== null) return;
    const added = (await Promise.all(files.map((f) => images.add(f)))).filter((a) => a !== null);
    setImageError(added.length < files.length);
    if (!added.length) return;
    const nodes = added.map((attrs) => ({ type: 'image', attrs }));
    const chain = editor.chain().focus();
    if (at === undefined) chain.insertContent(nodes).run();
    else chain.insertContentAt(at, nodes).run();
  }

  const getEditorView = useCallback(() => (editor ? editor.view : null), [editor]);

  /** Guarda en `contents` lo que muestra el editor (la pestaña activa). */
  const snapshotActive = () => {
    if (!editor || editor.isDestroyed) return;
    contents.current.set(
      activeTabRef.current,
      withoutEmptyAnchors(editor.getJSON()) as RichDocData['content'],
    );
  };
  /** Guarda tras un cambio de pestañas o de comentarios. */
  const saveNow = () => {
    if (readOnly !== null) return;
    snapshotActive();
    autosave.push(buildDoc());
  };

  /** Cambiar los hilos: se guardan con el contenido actual. */
  const changeComments = (next: DocComment[]) => {
    commentsRef.current = next;
    setComments(next);
    saveNow();
  };

  // --- Pestañas ---
  const updateTabs = (next: Array<{ id: string; title: string }>) => {
    tabsRef.current = next;
    setTabs(next);
  };
  const switchTab = (id: string) => {
    if (id === activeTabRef.current || !tabsRef.current.some((tab) => tab.id === id)) return;
    snapshotActive();
    activeTabRef.current = id;
    setEditorContent(contents.current.get(id) ?? emptyRichDoc().content);
    setActiveTab(id);
    setCommentDraft(null);
  };
  const newTabId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const addTab = () => {
    snapshotActive();
    const id = newTabId();
    contents.current.set(id, emptyRichDoc().content);
    updateTabs([...tabsRef.current, { id, title: '' }]);
    saveNow();
    switchTab(id);
  };
  const renameTab = (id: string, title: string) => {
    updateTabs(tabsRef.current.map((tab) => (tab.id === id ? { ...tab, title } : tab)));
    saveNow();
  };
  const duplicateTab = (id: string) => {
    snapshotActive();
    const source = contents.current.get(id);
    const original = tabsRef.current.find((tab) => tab.id === id);
    if (!source || !original) return;
    const copy = newTabId();
    // La copia no se lleva los comentarios ni las anclas de enlaces (son del original).
    contents.current.set(copy, withoutCommentsAndAnchors(source as RichNode) as RichDocData['content']);
    const index = tabsRef.current.findIndex((tab) => tab.id === id);
    const next = [...tabsRef.current];
    next.splice(index + 1, 0, {
      id: copy,
      title: t('docs.tabCopyOf', { title: original.title || t('docs.tabUntitled', { n: index + 1 }) }),
    });
    updateTabs(next);
    saveNow();
    switchTab(copy);
  };
  const deleteTab = (id: string) => {
    if (tabsRef.current.length < 2) return;
    const index = tabsRef.current.findIndex((tab) => tab.id === id);
    const name = tabsRef.current[index]?.title || t('docs.tabUntitled', { n: index + 1 });
    if (!window.confirm(t('docs.tabDeleteConfirm', { title: name }))) return;
    snapshotActive();
    const next = tabsRef.current.filter((tab) => tab.id !== id);
    if (mainTabRef.current === id) mainTabRef.current = next[0]!.id;
    if (activeTabRef.current === id) switchTab(next[Math.max(0, index - 1)]!.id);
    contents.current.delete(id);
    updateTabs(next);
    saveNow();
  };
  /** Pestaña (que no es la activa) donde está el texto de un hilo, para ir a él. */
  const tabOfComment = (commentId: string) => {
    const index = tabsRef.current.findIndex(
      (tab) =>
        tab.id !== activeTabRef.current &&
        commentIdsIn(contents.current.get(tab.id) as RichNode | undefined).has(commentId),
    );
    if (index < 0) return null;
    const tab = tabsRef.current[index]!;
    return { id: tab.id, title: tab.title || t('docs.tabUntitled', { n: index + 1 }) };
  };

  // «Exportar» de la cabecera (fase 8.4): Word (.docx) o PDF por la impresión del navegador.
  useEffect(
    () =>
      useUiStore.subscribe(({ viewCommand, documents: docs }) => {
        if (!editor || viewCommand?.documentId !== opened.document.id) return;
        if (viewCommand.kind !== 'export-docx' && viewCommand.kind !== 'export-pdf') return;
        if (viewCommand.seq <= handledCommand.current) return;
        handledCommand.current = viewCommand.seq;
        const title = docs.find((d) => d.id === opened.document.id)?.title ?? opened.document.title;
        if (viewCommand.kind === 'export-pdf') {
          printRichDoc(editor.view.dom as HTMLElement, title);
          return;
        }
        setExportError(false);
        snapshotActive();
        void docxBlob(buildDoc(), {
            title,
            tabLabel: (n) => t('docs.tabUntitled', { n }),
            image: async (hash) => {
              const asset = images.added.get(hash) ?? (await service.loadAsset(hash));
              return asset ? browserDocxImage(asset) : null;
            },
          })
          .then((blob) => downloadBlob(safeFilename(title, 'docx'), blob))
          .catch(() => setExportError(true));
      }),
    // `buildDoc` y `snapshotActive` leen el estado vigente por referencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, images, opened, service],
  );

  /** «Comentar»: abre el formulario para la selección actual. */
  const startComment = () => {
    if (!editor || readOnly !== null) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    setCommentDraft({ from, to });
    setCommentsOpen(true);
  };
  useEffect(() => {
    commentRef.current = startComment;
    insertImagesRef.current = insertImages;
  });
  // Resaltado: sin los hilos resueltos y con el activo destacado.
  useEffect(() => {
    if (!editor) return;
    setCommentView(editor, {
      resolved: new Set(comments.filter((c) => c.resolved).map((c) => c.id)),
      active: activeComment,
    });
  }, [editor, comments, activeComment]);

  // Paginación solo en la vista «Hoja» y en pantallas anchas (en las estrechas la hoja no tiene
  // medidas de A4).
  useEffect(() => {
    if (!editor) return;
    const wide = window.matchMedia('(min-width: 821px)');
    const apply = () => setPagination(editor.view, layout === 'page' && wide.matches);
    apply();
    wide.addEventListener('change', apply);
    return () => wide.removeEventListener('change', apply);
  }, [editor, layout]);

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
    // Si el fragmento no está en la pestaña activa pero sí en otra, se cambia a esa pestaña y el
    // enlace se resuelve allí (el editor nuevo vuelve a pasar por aquí).
    const anchor = { blockId: target.blockId ?? null, text: quote };
    if (tabsRef.current.length > 1 && resolveAnchor(projection, anchor)?.status !== 'found') {
      const other = tabsRef.current.find(
        (tab) =>
          tab.id !== activeTabRef.current &&
          resolveAnchor(
            contentProjection(contents.current.get(tab.id) ?? emptyRichDoc().content),
            anchor,
          )?.status === 'found',
      );
      if (other) {
        useUiStore.setState({ focus: target });
        switchTab(other.id);
        return;
      }
    }
    const result = resolveAnchor(projection, {
      blockId: target.blockId ?? null,
      text: quote,
    });
    // Sincroniza con una orden externa (la navegación), una vez por enlace seguido.
    setAnchorStatus(!fromLink || !result || result.status === 'found' ? null : result.status);
    if (!result || result.status === 'lost') return;
    const from = sourceOffset(projection, result.from, 'start');
    const to = sourceOffset(projection, result.to, 'end');
    if (from === null || to === null) return;
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
    // `switchTab` solo usa referencias y el editor vigente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, focus, opened.document.id]);

  /** Enlaces: los internos se abren en la app; los externos solo con Ctrl/⌘ y sin opener. */
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // Pulsar un texto comentado abre su hilo.
    const commented = (event.target as HTMLElement).closest<HTMLElement>('[data-comment-id]');
    if (commented?.dataset['commentId']) {
      setActiveComment(commented.dataset['commentId']);
      setCommentsOpen(true);
    }
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
      {exportError && (
        <p className="notice" role="alert" data-testid="doc-export-error">
          {t('docs.exportFailed')}
        </p>
      )}
      {imageError && (
        <p className="notice" role="status" data-testid="doc-image-error">
          {t('docs.imageRejected')}
        </p>
      )}
      <div className="doc-toolbar" role="toolbar" aria-label={t('docs.toolbar')}>
        {editor && (
          <FormatControls
            editor={editor}
            disabled={readOnly !== null}
            zoom={<ZoomSelect zoom={zoom} onChange={setZoom} />}
            onLink={openLink}
            onCopyLink={copyLink}
            onComment={startComment}
            onImage={() => imageInput.current?.click()}
          />
        )}
        <span className="doc-toolbar-spacer" />
        {editor && <PageCount editor={editor} />}
        <button
          type="button"
          className="icon-button"
          aria-pressed={outlineOpen}
          aria-label={t('docs.outline')}
          title={t('docs.outline')}
          data-testid="doc-outline-toggle"
          onClick={() => setOutlineOpen(!outlineOpen)}
        >
          <Icon name="panel-lateral" size={18} />
        </button>
        <button
          type="button"
          className="icon-button doc-comments-toggle"
          aria-pressed={commentsOpen}
          aria-label={t('docs.comments')}
          title={t('docs.comments')}
          data-testid="doc-comments-toggle"
          onClick={() => setCommentsOpen(!commentsOpen)}
        >
          <Icon name="comentario" size={18} />
          {comments.some((c) => !c.resolved) && (
            <span className="doc-comments-count">{comments.filter((c) => !c.resolved).length}</span>
          )}
        </button>
        <LayoutToggle layout={layout} onChange={setLayout} compact />
      </div>
      <div className="doc-body">
        {outlineOpen && editor && (
          <DocTabsPanel
            editor={editor}
            tabs={tabs}
            activeId={activeTab}
            readOnly={readOnly !== null}
            onSwitch={switchTab}
            onAdd={addTab}
            onRename={renameTab}
            onDuplicate={duplicateTab}
            onDelete={deleteTab}
            onClose={() => setOutlineOpen(false)}
          />
        )}
        <div className="doc-scroll">
          {/* Zoom con la propiedad CSS `zoom`: a diferencia de `transform`, el editor sigue
              colocando bien el cursor y la selección. */}
          <div className="doc-sheet" style={{ zoom: zoom / 100 }} onClick={onClick}>
            <EditorContent editor={editor} />
            <input
              ref={imageInput}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              data-testid="doc-image-input"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void insertImages(files);
              }}
            />
          </div>
        </div>
        {commentsOpen && editor && (
          <CommentsPanel
            editor={editor}
            comments={comments}
            readOnly={readOnly !== null}
            active={activeComment}
            draft={commentDraft}
            onChange={changeComments}
            onActivate={setActiveComment}
            onCancelDraft={() => setCommentDraft(null)}
            tabOf={tabOfComment}
            onSwitchTab={switchTab}
            onClose={() => {
              setCommentsOpen(false);
              setCommentDraft(null);
            }}
          />
        )}
      </div>
      {linker.picker}
      {/* Burbuja al seleccionar texto: comentar y enlazar (como Google Docs). */}
      <SelectionBubble
        getView={getEditorView}
        disabled={readOnly !== null}
        actions={[
          {
            id: 'comment',
            label: t('docs.commentAddShort'),
            icon: 'comentario',
            onRun: startComment,
          },
          { id: 'link', label: t('links.linkSelectionShort'), icon: 'enlace', onRun: openLink },
        ]}
      />
    </div>
  );
}

/** Número de páginas de la vista «Hoja» (solo con paginación activa). */
function PageCount({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const pages = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const value = paginationKey.getState(e.state);
      return value?.enabled ? value.pages : null;
    },
  });
  if (pages === null) return null;
  return (
    <span className="doc-page-count" data-testid="doc-page-count">
      {t('docs.pageCount', { count: pages })}
    </span>
  );
}

/** Botones de formato. Su estado (activo o no) se lee del editor en cada transacción. */
function FormatControls({
  editor,
  disabled,
  onLink,
  onCopyLink,
  onComment,
  onImage,
  zoom,
}: {
  editor: Editor;
  disabled: boolean;
  /** Desplegable de zoom: el primero tras deshacer/rehacer, como en Drive. */
  zoom: ReactNode;
  onLink: () => void;
  onCopyLink: () => void;
  onComment: () => void;
  onImage: () => void;
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
      fontFamily: (e.getAttributes('textStyle')['fontFamily'] as string | undefined) ?? null,
      fontSize: parsePx(e.getAttributes('textStyle')['fontSize']),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      hasSelection: !e.state.selection.empty,
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
      <div className="doc-toolbar-group">{zoom}</div>
      <div className="doc-toolbar-group">
        <BlockStyleSelect value={state.block} disabled={disabled} onChange={setBlock} />
      </div>
      <div className="doc-toolbar-group">
        <FontFamilyPicker
          value={state.fontFamily}
          disabled={disabled}
          onPick={(font) =>
            font
              ? chain().setFontFamily(fontStack(font)).run()
              : chain().unsetFontFamily().run()
          }
        />
        <FontSizeControl
          size={state.fontSize}
          disabled={disabled}
          onChange={(size) => chain().setFontSize(`${size}px`).run()}
        />
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
          id="link"
          icon="enlace"
          label={t('links.linkSelection')}
          disabled={disabled}
          onRun={onLink}
        />
        <ToolIconButton
          id="comment"
          icon="comentario"
          label={t('docs.commentAdd')}
          disabled={disabled || !state.hasSelection}
          onRun={onComment}
        />
        <ToolIconButton
          id="image"
          icon="imagen"
          label={t('docs.insertImage')}
          disabled={disabled}
          onRun={onImage}
        />
      </div>
      <div className="doc-toolbar-group">
        <Menu
          trigger={
            <>
              <Icon
                name={state.center ? 'alinear-centro' : state.right ? 'alinear-der' : 'alinear-izq'}
                size={18}
              />
              <Icon name="chevron-abajo" size={12} />
            </>
          }
          label={t('docs.align')}
          triggerClassName="icon-button doc-align-trigger"
          testId="doc-align"
          placement="bottom-start"
          items={(
            [
              ['left', 'alinear-izq', t('docs.alignLeft')],
              ['center', 'alinear-centro', t('docs.alignCenter')],
              ['right', 'alinear-der', t('docs.alignRight')],
            ] as const
          ).map(([value, icon, label]) => ({
            id: `doc-align-${value}`,
            label,
            icon,
            onSelect: () => chain().setTextAlign(value).run(),
          }))}
        />
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
