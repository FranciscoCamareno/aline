import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { clipboard } from '@milkdown/plugin-clipboard';
import { history, redoCommand, undoCommand } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import {
  commonmark,
  imageSchema,
  toggleEmphasisCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { Plugin, Selection, type EditorState } from '@milkdown/prose/state';
import { $prose, callCommand, getMarkdown } from '@milkdown/utils';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadText } from '../../app/download.ts';
import { logDiagnostic, registerFlusher } from '../../app/runtime.ts';
import { useUiStore } from '../../app/store.ts';
import { useAutosave } from '../../app/useAutosave.ts';
import { parseInternalLink } from '../../application/knowledge.ts';
import { safeFilename } from '../../application/portability.ts';
import type { OpenedNote, VaultService } from '../../application/VaultService.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import { LayoutToggle, useDocLayout } from './layout.tsx';
import { BlockStyleSelect, ToolIconButton, ToolMarkButton, type BlockStyle } from './toolbar.tsx';

interface Props {
  documentId: string;
  /** Título vigente, para el nombre del archivo exportado. */
  title: string;
  service: VaultService;
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
export function MarkdownDocView({ documentId, title, service }: Props) {
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
      placeholder={t('docs.placeholder')}
    />
  );
}

function MarkdownDocEditor({
  opened,
  title,
  service,
  placeholder,
}: {
  opened: OpenedNote;
  title: string;
  service: VaultService;
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
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(markDirty)
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
        navigate({ documentId: target.documentId, elementId: target.elementId });
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
    </div>
  );
}
