import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutosave } from '../../app/useAutosave.ts';
import { Icon, type IconName } from '../../app/ui/Icon.tsx';
import type { OpenedRichDoc, VaultService } from '../../application/VaultService.ts';
import type { ReadOnlyReason } from '../../domain/compat.ts';
import type { RichDocData } from '../../domain/richDoc.ts';

interface Props {
  documentId: string;
  service: VaultService;
}

/** Presentación del documento: texto corrido o una hoja A4. No cambia el contenido guardado. */
type Layout = 'continuous' | 'page';
const LAYOUT_KEY = 'mindnote.docLayout';

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'continuous' ? 'continuous' : 'page';
  } catch {
    return 'page';
  }
}

function writeLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Sin almacenamiento del navegador: la preferencia dura lo que la pestaña.
  }
}

/**
 * Documento de texto enriquecido (kind `doc`) editado con Tiptap. Cada cambio pasa por el
 * guardado automático y es una revisión nueva (VaultService.saveRichDoc). Sin extensión de
 * imágenes ni incrustados: lo pegado desde la web no descarga nada (diseño §13).
 */
export function DocView({ documentId, service }: Props) {
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
  return <DocEditor opened={opened} service={service} placeholder={t('docs.placeholder')} />;
}

function DocEditor({
  opened,
  service,
  placeholder,
}: {
  opened: OpenedRichDoc;
  service: VaultService;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<Layout>(readLayout);
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
        // Los enlaces no se abren al hacer clic dentro del editor; solo se admiten http(s) y mailto.
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
          isAllowedUri: (url) => /^(https?:|mailto:)/i.test(url),
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: opened.doc.content as JSONContent,
    editable: opened.readOnly === null,
    // Al abrir, el cursor va al final para poder escribir sin hacer clic.
    autofocus: opened.readOnly === null ? 'end' : false,
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
    },
    onUpdate: ({ editor: instance }) => {
      if (!instance.isEditable) return;
      autosave.push(instance.getJSON() as RichDocData['content']);
    },
  });

  const changeLayout = (next: Layout) => {
    setLayout(next);
    writeLayout(next);
  };

  return (
    <div className={`doc-view layout-${layout}`} data-testid="doc-view">
      {readOnly && (
        <p className="notice" role="alert" data-testid="read-only-notice">
          {t(`readOnly.${readOnly}`)}
        </p>
      )}
      <div className="doc-toolbar" role="toolbar" aria-label={t('docs.toolbar')}>
        {editor && <FormatControls editor={editor} disabled={readOnly !== null} />}
        <span className="doc-toolbar-spacer" />
        <div className="segmented" role="group" aria-label={t('docs.layout')}>
          {(['continuous', 'page'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              data-testid={`doc-layout-${value}`}
              className={`segmented-option${layout === value ? " is-active" : ""}`}
              onClick={() => changeLayout(value)}
            >
              {t(`docs.layout_${value}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="doc-scroll">
        <div className="doc-sheet">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

type BlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3';

/** Botones de formato. Su estado (activo o no) se lee del editor en cada transacción. */
function FormatControls({ editor, disabled }: { editor: Editor; disabled: boolean }) {
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

  const iconButton = (
    id: string,
    icon: IconName,
    label: string,
    active: boolean,
    run: () => void,
    enabled = true,
  ) => (
    <button
      key={id}
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={`doc-${id}`}
      disabled={disabled || !enabled}
      onClick={run}
    >
      <Icon name={icon} size={18} />
    </button>
  );

  /** Formato de carácter con su letra (sin iconos propios todavía). */
  const markButton = (id: string, letter: string, label: string, active: boolean, run: () => void) => (
    <button
      key={id}
      type="button"
      className={`icon-button doc-mark doc-mark-${id}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={`doc-${id}`}
      disabled={disabled}
      onClick={run}
    >
      <span aria-hidden="true">{letter}</span>
    </button>
  );

  return (
    <>
      <div className="doc-toolbar-group">
        {iconButton('undo', 'deshacer', t('docs.undo'), false, () => chain().undo().run(), state.canUndo)}
        {iconButton('redo', 'rehacer', t('docs.redo'), false, () => chain().redo().run(), state.canRedo)}
      </div>
      <div className="doc-toolbar-group">
        <select
          className="doc-block-style"
          aria-label={t('docs.blockStyle')}
          data-testid="doc-block-style"
          value={state.block}
          disabled={disabled}
          onChange={(e) => setBlock(e.target.value as BlockStyle)}
        >
          <option value="paragraph">{t('docs.paragraph')}</option>
          <option value="h1">{t('docs.heading', { level: 1 })}</option>
          <option value="h2">{t('docs.heading', { level: 2 })}</option>
          <option value="h3">{t('docs.heading', { level: 3 })}</option>
        </select>
      </div>
      <div className="doc-toolbar-group">
        {markButton('bold', 'B', t('docs.bold'), state.bold, () => chain().toggleBold().run())}
        {markButton('italic', 'I', t('docs.italic'), state.italic, () =>
          chain().toggleItalic().run(),
        )}
        {markButton('underline', 'U', t('docs.underline'), state.underline, () =>
          chain().toggleUnderline().run(),
        )}
        {markButton('strike', 'S', t('docs.strike'), state.strike, () =>
          chain().toggleStrike().run(),
        )}
      </div>
      <div className="doc-toolbar-group">
        {iconButton('align-left', 'alinear-izq', t('docs.alignLeft'), state.left, () =>
          chain().setTextAlign('left').run(),
        )}
        {iconButton('align-center', 'alinear-centro', t('docs.alignCenter'), state.center, () =>
          chain().setTextAlign('center').run(),
        )}
        {iconButton('align-right', 'alinear-der', t('docs.alignRight'), state.right, () =>
          chain().setTextAlign('right').run(),
        )}
      </div>
      <div className="doc-toolbar-group">
        {iconButton('bullet-list', 'lista', t('docs.bulletList'), state.bulletList, () =>
          chain().toggleBulletList().run(),
        )}
        {iconButton('ordered-list', 'lista-numerada', t('docs.orderedList'), state.orderedList, () =>
          chain().toggleOrderedList().run(),
        )}
        {iconButton('blockquote', 'cita', t('docs.blockquote'), state.blockquote, () =>
          chain().toggleBlockquote().run(),
        )}
      </div>
    </>
  );
}
