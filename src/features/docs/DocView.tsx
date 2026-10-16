import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutosave } from '../../app/useAutosave.ts';
import type { OpenedRichDoc, VaultService } from '../../application/VaultService.ts';
import type { ReadOnlyReason } from '../../domain/compat.ts';
import type { RichDocData } from '../../domain/richDoc.ts';
import { LayoutToggle, useDocLayout } from './layout.tsx';
import { BlockStyleSelect, ToolIconButton, ToolMarkButton, type BlockStyle } from './toolbar.tsx';

interface Props {
  documentId: string;
  service: VaultService;
}

/**
 * Documento con formato (kind `doc`) editado con Tiptap. Cada cambio pasa por el guardado
 * automático y es una revisión nueva (VaultService.saveRichDoc). Sin extensión de imágenes ni
 * incrustados: lo pegado desde la web no descarga nada (diseño §13).
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
        <LayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div className="doc-scroll">
        <div className="doc-sheet">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

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
    </>
  );
}
