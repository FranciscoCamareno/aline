import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { clipboard } from '@milkdown/plugin-clipboard';
import { history, redoCommand, undoCommand } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import {
  commonmark,
  imageSchema,
  linkSchema,
  toggleEmphasisCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { Plugin, Selection, TextSelection, type EditorState } from '@milkdown/prose/state';
import { $prose, callCommand, getMarkdown } from '@milkdown/utils';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadText } from '../../app/download.ts';
import { logDiagnostic, registerFlusher } from '../../app/runtime.ts';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { useAutosave } from '../../app/useAutosave.ts';
import {
  projectionOffset,
  quoteLabel,
  resolveAnchor,
  selectorForRange,
  sourceOffset,
} from '../../domain/anchors.ts';
import { internalLink, parseInternalLink } from '../../domain/links.ts';
import { safeFilename } from '../../application/portability.ts';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import type { OpenedNote, VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import { AnchorNotice, CopiedNotice, type AnchorStatus } from '../knowledge/anchorUi.tsx';
import { backlinkRanges, useBacklinkAnchors } from '../knowledge/backlinkMarks.ts';
import { pmProjection } from '../knowledge/pmProjection.ts';
import {
  isCopyLinkShortcut,
  isLinkShortcut,
  useSelectionLinker,
} from '../knowledge/useSelectionLinker.tsx';
import { milkdownBacklinkKey, milkdownBacklinkPlugin } from './backlinkMarksPm.ts';
import { LayoutToggle, useDocLayout } from './layout.tsx';
import { BlockStyleSelect, ToolIconButton, ToolMarkButton, type BlockStyle } from './toolbar.tsx';

interface Props {
  documentId: string;
  /** Título vigente, para el nombre del archivo exportado. */
  title: string;
  service: VaultService;
  /** Backlinks con ancla, para resaltar los fragmentos enlazados. */
  knowledge: KnowledgeService;
  /** FA-03a: crear la nota de destino desde «Enlazar selección». */
  onCreateNote: (title: string) => Promise<DocumentRecord>;
}

/**
 * Imágenes sin descarga (diseño §13): el esquema de Milkdown pinta `<img src>`, que pediría la
 * imagen remota. Aquí se muestra su texto alternativo, con la dirección en `data-src` y en el
 * título, sin cargar nada; el Markdown guardado no cambia. La regla de lectura recupera la
 * imagen de ese mismo marcado: al pegar Markdown, Milkdown lo pasa por el DOM y lo vuelve a leer.
 */
const imageWithoutFetch = imageSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    ...base,
    // Una imagen sin título (`![a](url)`) llega con `title: null` y el esquema exige texto: sin
    // esto, abrir un documento con una imagen así fallaría.
    parseMarkdown: {
      ...base.parseMarkdown,
      runner: (state, node, type) =>
        base.parseMarkdown.runner(
          state,
          { ...node, title: text(node['title']), alt: text(node['alt']) },
          type,
        ),
    },
    parseDOM: [
      {
        tag: 'span.md-image[data-src]',
        getAttrs: (dom) =>
          dom instanceof HTMLElement
            ? {
                src: dom.dataset['src'] ?? '',
                alt: dom.dataset['alt'] ?? '',
                title: dom.dataset['title'] ?? '',
              }
            : false,
      },
      ...(base.parseDOM ?? []),
    ],
    toDOM: (node) => {
      const src = text(node.attrs['src']);
      const alt = text(node.attrs['alt']);
      return [
        'span',
        {
          class: 'md-image',
          title: src,
          'data-src': src,
          'data-alt': alt,
          'data-title': text(node.attrs['title']),
        },
        `[${alt || src}]`,
      ];
    },
  };
});

/**
 * Enlaces internos: el esquema de Milkdown vacía en el DOM todo `href` cuyo esquema no esté en
 * su lista (http, mailto…), así que `aline://` (y el anterior `mindnote://`) quedaban sin
 * destino, ni para seguirlos ni al copiar y pegar dentro del editor. Solo los enlaces internos
 * válidos conservan su `href`; el resto sigue pasando por el saneado de Milkdown.
 */
const linkKeepingInternal = linkSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    toDOM: (mark, inline) => {
      const spec = base.toDOM!(mark, inline);
      const href: unknown = mark.attrs['href'];
      if (typeof href !== 'string' || !parseInternalLink(href) || !Array.isArray(spec)) return spec;
      const [tag, attrs, ...rest] = spec as unknown as [string, Record<string, unknown>];
      return [tag, { ...attrs, href }, ...rest];
    },
  };
});

/** Estado de la barra de formato a partir de la selección del editor. */
interface FormatState {
  block: BlockStyle;
  strong: boolean;
  emphasis: boolean;
  strike: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
}

const EMPTY_FORMAT: FormatState = {
  block: 'paragraph',
  strong: false,
  emphasis: false,
  strike: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
};

function formatState(state: EditorState): FormatState {
  const { from, to, empty, $from } = state.selection;
  const mark = (name: string) => {
    const type = state.schema.marks[name];
    if (!type) return false;
    return empty
      ? Boolean(type.isInSet(state.storedMarks ?? $from.marks()))
      : state.doc.rangeHasMark(from, to, type);
  };
  const inside = (name: string) => {
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === name) return true;
    }
    return false;
  };
  const parent = $from.parent;
  const level = parent.type.name === 'heading' ? Number(parent.attrs['level']) : 0;
  return {
    block: level >= 1 && level <= 3 ? (`h${level}` as BlockStyle) : 'paragraph',
    strong: mark('strong'),
    emphasis: mark('emphasis'),
    strike: mark('strike_through'),
    bulletList: inside('bullet_list'),
    orderedList: inside('ordered_list'),
    blockquote: inside('blockquote'),
  };
}

/**
 * Documento Markdown (kind `mddoc`) editado con Milkdown: se ve con formato y se guarda como
 * Markdown, con el mismo formato que una nota (frontmatter, copia legible, edición externa).
 * Se abre y guarda con openNote/saveNote; cada cambio es una revisión nueva.
 */
export function MarkdownDocView({ documentId, title, service, knowledge, onCreateNote }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<OpenedNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    service.openNote(documentId).then(
      (note) => !cancelled && setOpened(note),
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
    <MarkdownDocEditor
      opened={opened}
      title={title}
      service={service}
      knowledge={knowledge}
      onCreateNote={onCreateNote}
      placeholder={t('docs.placeholder')}
    />
  );
}

function MarkdownDocEditor({
  opened,
  title,
  service,
  knowledge,
  onCreateNote,
  placeholder,
}: {
  opened: OpenedNote;
  title: string;
  service: VaultService;
  knowledge: KnowledgeService;
  onCreateNote: (title: string) => Promise<DocumentRecord>;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [layout, setLayout] = useDocLayout();
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [format, setFormat] = useState<FormatState>(EMPTY_FORMAT);
  const documents = useUiStore((s) => s.documents);
  const navigate = useUiStore((s) => s.navigate);
  /** Las órdenes anteriores al montaje no se ejecutan. */
  const handledCommand = useRef(useUiStore.getState().viewCommand?.seq ?? 0);
  const readOnly = opened.readOnly;
  const documentId = opened.document.id;

  const [createError, setCreateError] = useState<string | null>(null);
  const autosave = useAutosave<string>((markdown) => service.saveNote(opened.session, markdown));
  /** «Enlazar selección» vigente, para el atajo del editor (que se crea una sola vez). */
  const openLinkRef = useRef<() => void>(() => undefined);
  const copyLinkRef = useRef<() => void>(() => undefined);
  const focus = useUiStore((s) => s.focus);
  const copyToStore = useUiStore((s) => s.copyLink);
  /** El fragmento del último enlace seguido cambió o ya no está. */
  const [anchorStatus, setAnchorStatus] = useState<AnchorStatus>(null);
  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  }, [autosave]);

  // El editor se crea una vez por documento abierto; el contenido inicial es el cuerpo guardado.
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let destroyed = false;
    let instance: Editor | null = null;
    /** Último Markdown entregado al guardado automático. */
    let lastPushed = opened.body;
    /**
     * Hay cambios que Milkdown aún no ha entregado: avisa de ellos 200 ms después. Esta marca es
     * inmediata (un plugin de ProseMirror) para no perder lo último escrito al cambiar de
     * documento, cerrar la pestaña o actualizar la aplicación.
     */
    let dirty = false;
    const pushMarkdown = (markdown: string) => {
      dirty = false;
      if (readOnly !== null || markdown === lastPushed) return;
      lastPushed = markdown;
      autosaveRef.current.push(markdown);
    };
    /** Entrega ya lo pendiente y lo guarda. */
    const syncNow = (): Promise<void> => {
      if (dirty && instance) pushMarkdown(instance.action(getMarkdown()));
      return autosaveRef.current.flush().then(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void syncNow().catch(() => undefined);
    };
    const onPageHide = () => void syncNow().catch(() => undefined);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    const unregister = registerFlusher(syncNow);
    // Ctrl/⌘+K: enlazar la selección (la función vigente está en openLinkRef).
    const linkShortcut = $prose(
      () =>
        new Plugin({
          props: {
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
        }),
    );
    const markDirty = $prose(
      () =>
        new Plugin({
          view: () => ({
            update: (view, previous) => {
              if (!view.state.doc.eq(previous.doc)) dirty = true;
            },
          }),
        }),
    );
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, opened.body);
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => readOnly === null,
          attributes: {
            class: 'doc-content',
            'aria-label': t('docs.editor'),
            'data-testid': 'doc-editor',
            spellcheck: 'true',
            style: `--doc-placeholder: ${JSON.stringify(placeholder)}`,
          },
        }));
        ctx
          .get(listenerCtx)
          // Solo los cambios del usuario: abrir el documento no crea una revisión.
          .markdownUpdated((_ctx, markdown) => pushMarkdown(markdown))
          .selectionUpdated((listenerCtx) =>
            setFormat(formatState(listenerCtx.get(editorViewCtx).state)),
          )
          .updated((listenerCtx) => setFormat(formatState(listenerCtx.get(editorViewCtx).state)));
      })
      .use(commonmark)
      .use(imageWithoutFetch)
      .use(linkKeepingInternal)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(markDirty)
      .use(linkShortcut)
      .use($prose(() => milkdownBacklinkPlugin()))
      .create()
      .then((created) => {
        if (destroyed) {
          void created.destroy();
          return;
        }
        instance = created;
        setEditor(created);
        if (readOnly === null) {
          // Al abrir, el cursor va al final para poder escribir sin hacer clic.
          const view = created.ctx.get(editorViewCtx);
          view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
          view.focus();
        }
      })
      .catch((error: unknown) => {
        logDiagnostic('error', 'docs.markdown-editor', describeError(error));
        if (!destroyed) setCreateError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      destroyed = true;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      unregister();
      // Lo escrito en los últimos 200 ms se entrega antes de destruir el editor.
      void syncNow().catch(() => undefined);
      setEditor(null);
      void instance?.destroy();
    };
    // Se crea una sola vez por documento abierto (opened); los textos no lo recrean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // «Exportar → Markdown» de la cabecera, igual que una nota: lo pendiente se guarda antes.
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

  const run = (command: Parameters<typeof callCommand>[0], payload?: unknown) => {
    if (!editor) return;
    editor.action(callCommand(command, payload));
    editor.ctx.get(editorViewCtx).focus();
  };
  const setBlock = (block: BlockStyle) => {
    if (block === 'paragraph') run(turnIntoTextCommand.key);
    else run(wrapInHeadingCommand.key, Number(block.slice(1)));
  };
  const disabled = readOnly !== null || !editor;

  /** «Enlazar selección»: marca `link` sobre la selección, o el título enlazado si no hay texto. */
  const linker = useSelectionLinker({
    sourceId: documentId,
    service,
    onCreateNote,
    apply: (range, pick) => {
      if (!editor) return;
      const view = editor.ctx.get(editorViewCtx);
      const { state } = view;
      const type = state.schema.marks['link'];
      if (!type) return;
      const size = state.doc.content.size;
      const from = Math.min(range.from, size);
      const to = Math.min(range.to, size);
      const mark = type.create({ href: pick.url });
      const tr = state.tr;
      if (state.doc.textBetween(from, to).trim()) tr.removeMark(from, to, type).addMark(from, to, mark);
      else tr.insert(to, state.schema.text(pick.title, [mark]));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    onClose: () => editor?.ctx.get(editorViewCtx).focus(),
  });
  const openLink = () => {
    if (!editor || readOnly !== null) return;
    const { from, to } = editor.ctx.get(editorViewCtx).state.selection;
    linker.open({ from, to });
  };
  /** «Copiar enlace a la selección»: cita del texto seleccionado (o del bloque del cursor). */
  const copyLink = () => {
    if (!editor) return;
    const { state } = editor.ctx.get(editorViewCtx);
    const projection = pmProjection(state.doc);
    const selector = selectorForRange(
      projection,
      projectionOffset(projection, state.selection.from, 'start'),
      projectionOffset(projection, state.selection.to, 'end'),
    );
    copyToStore({
      url: internalLink(documentId, selector ? { text: selector } : null),
      label: selector ? quoteLabel(selector) : title,
      documentTitle: title,
    });
  };
  useEffect(() => {
    openLinkRef.current = openLink;
    copyLinkRef.current = copyLink;
  });

  // Fragmentos de este documento con backlinks: se resaltan en el editor (fase 7.F).
  const backlinkAnchors = useBacklinkAnchors(knowledge, documentId);
  useEffect(() => {
    if (!editor) return;
    const view = editor.ctx.get(editorViewCtx);
    const ranges = backlinkRanges(pmProjection(view.state.doc), backlinkAnchors).map((r) => ({
      ...r,
      title: t('links.linkedFrom', { sources: r.sources.join(', ') }),
    }));
    view.dispatch(
      view.state.tr.setMeta(milkdownBacklinkKey, ranges).setMeta('addToHistory', false),
    );
  }, [editor, backlinkAnchors, t]);

  // Seguir un enlace con ancla a este documento: seleccionar y mostrar el fragmento citado.
  useEffect(() => {
    if (!editor || focus?.documentId !== documentId) return;
    const target = useUiStore.getState().consumeFocus(documentId);
    // Un texto buscado (búsqueda, backlinks) se busca como una cita, sin aviso si no está.
    const searched = target?.text?.trim();
    const quote =
      target?.quote ?? (searched ? { prefix: '', start: searched, end: '', suffix: '' } : null);
    if (!target || (!quote && !target.blockId)) return;
    const fromLink = Boolean(target.quote || target.blockId);
    const view = editor.ctx.get(editorViewCtx);
    const projection = pmProjection(view.state.doc);
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
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView(),
    );
    view.focus();
  }, [editor, focus, documentId]);

  return (
    <div className={`doc-view md-doc layout-${layout}`} data-testid="md-doc-view">
      {readOnly && (
        <p className="notice" role="alert" data-testid="read-only-notice">
          {t(`readOnly.${readOnly}`)}
        </p>
      )}
      {createError && (
        <p className="notice" role="alert" data-testid="editor-error">
          {t('docs.editorError', { message: createError })}
        </p>
      )}
      {opened.frontmatterInvalid && (
        <p className="notice" role="status">
          {t('notes.invalidFrontmatter')}
        </p>
      )}
      <AnchorNotice status={anchorStatus} />
      <div className="doc-toolbar" role="toolbar" aria-label={t('docs.toolbar')}>
        <div className="doc-toolbar-group">
          <ToolIconButton
            id="undo"
            icon="deshacer"
            label={t('docs.undo')}
            disabled={disabled}
            onRun={() => run(undoCommand.key)}
          />
          <ToolIconButton
            id="redo"
            icon="rehacer"
            label={t('docs.redo')}
            disabled={disabled}
            onRun={() => run(redoCommand.key)}
          />
        </div>
        <div className="doc-toolbar-group">
          <BlockStyleSelect value={format.block} disabled={disabled} onChange={setBlock} />
        </div>
        <div className="doc-toolbar-group">
          <ToolMarkButton
            id="bold"
            letter="B"
            label={t('docs.bold')}
            active={format.strong}
            disabled={disabled}
            onRun={() => run(toggleStrongCommand.key)}
          />
          <ToolMarkButton
            id="italic"
            letter="I"
            label={t('docs.italic')}
            active={format.emphasis}
            disabled={disabled}
            onRun={() => run(toggleEmphasisCommand.key)}
          />
          <ToolMarkButton
            id="strike"
            letter="S"
            label={t('docs.strike')}
            active={format.strike}
            disabled={disabled}
            onRun={() => run(toggleStrikethroughCommand.key)}
          />
        </div>
        <div className="doc-toolbar-group">
          <ToolIconButton
            id="bullet-list"
            icon="lista"
            label={t('docs.bulletList')}
            active={format.bulletList}
            disabled={disabled}
            onRun={() => run(wrapInBulletListCommand.key)}
          />
          <ToolIconButton
            id="ordered-list"
            icon="lista-numerada"
            label={t('docs.orderedList')}
            active={format.orderedList}
            disabled={disabled}
            onRun={() => run(wrapInOrderedListCommand.key)}
          />
          <ToolIconButton
            id="blockquote"
            icon="cita"
            label={t('docs.blockquote')}
            active={format.blockquote}
            disabled={disabled}
            onRun={() => run(wrapInBlockquoteCommand.key)}
          />
        </div>
        <div className="doc-toolbar-group">
          <ToolIconButton
            id="link"
            icon="enlace"
            label={t('links.linkSelection')}
            disabled={disabled}
            onRun={openLink}
          />
          <ToolIconButton
            id="copy-link"
            icon="duplicar"
            label={t('links.copyLink')}
            disabled={!editor}
            onRun={copyLink}
          />
          <CopiedNotice />
        </div>
        <span className="doc-toolbar-spacer" />
        <span className="doc-format-badge" title={t('docs.markdownHint')}>
          Markdown
        </span>
        <LayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div className="doc-scroll">
        <div className="doc-sheet" onClick={onClick}>
          <div ref={host} className="md-doc-host" />
        </div>
      </div>
      {linker.picker}
    </div>
  );
}
