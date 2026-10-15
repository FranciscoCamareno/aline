import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logDiagnostic } from '../../app/runtime.ts';
import { useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import type { VaultService } from '../../application/VaultService.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import { RenameableTitle } from '../library/RenameableTitle.tsx';
import { TemplateThumb } from './TemplateThumb.tsx';
import {
  hasSelection,
  insertTemplate,
  saveSelectionAsTemplate,
  TEMPLATE_DRAG_TYPE,
} from './templates.ts';

interface Props {
  api: ExcalidrawImperativeAPI;
  service: VaultService;
  /** Hay elementos seleccionados en el lienzo. */
  selectionActive: boolean;
  onClose: () => void;
}

/**
 * Panel «Plantillas» del lienzo: guardar la selección (con imágenes y stickers) e insertarla con
 * un clic o arrastrándola. Las plantillas son documentos del almacén: tienen historial, papelera,
 * copias de seguridad y sincronización.
 */
export function TemplatesPanel({ api, service, selectionActive, onClose }: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const upsertDocument = useUiStore((s) => s.upsertDocument);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const templates = documents
    .filter((d) => d.kind === 'template' && !d.deleted)
    .sort((a, b) => a.title.localeCompare(b.title));

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, []);

  const fail = (error: unknown) => {
    logDiagnostic('error', 'template', describeError(error));
    setError(t('templates.failed'));
  };

  const save = async (title: string) => {
    setName(null);
    try {
      const doc = await saveSelectionAsTemplate(api, service, title);
      if (doc) upsertDocument(doc);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section
      ref={panelRef}
      className="templates-panel"
      aria-label={t('templates.title')}
      data-testid="templates-panel"
      onKeyDown={(e) => e.key === 'Escape' && name === null && onClose()}
    >
      <header className="templates-head">
        <h2 className="section-title">{t('templates.title')}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('app.dismiss')}
          onClick={onClose}
        >
          <Icon name="cerrar" size={18} />
        </button>
      </header>

      {name === null ? (
        <button
          type="button"
          data-testid="template-save"
          disabled={!selectionActive}
          title={selectionActive ? undefined : t('templates.selectFirst')}
          onClick={() => setName(t('templates.defaultName', { count: templates.length + 1 }))}
        >
          <Icon name="mas" size={18} />
          {t('templates.saveSelection')}
        </button>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const title = name.trim();
            if (title && hasSelection(api)) void save(title);
            else setName(null);
          }}
        >
          <input
            autoFocus
            value={name}
            aria-label={t('templates.name')}
            data-testid="template-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setName(null)}
          />
          <button type="submit" className="icon-button" aria-label={t('templates.saveSelection')}>
            <Icon name="check" size={18} />
          </button>
        </form>
      )}

      {error && (
        <p className="field-problem" role="alert">
          {error}
        </p>
      )}

      {templates.length === 0 ? (
        <p className="muted small">{t('templates.empty')}</p>
      ) : (
        <ul className="library-list templates-list" data-testid="templates-list">
          {templates.map((doc) => (
            <li
              key={doc.id}
              data-testid="template-item"
              data-document-id={doc.id}
              draggable={renaming?.id !== doc.id}
              onDragStart={(e) => {
                e.dataTransfer.setData(TEMPLATE_DRAG_TYPE, doc.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <TemplateThumb
                documentId={doc.id}
                revisionKey={doc.headRevisionIds.join()}
                service={service}
              />
              <RenameableTitle
                title={doc.title}
                testId="template-title"
                showRenameButton={false}
                editRequest={renaming?.id === doc.id ? renaming.seq : 0}
                onOpen={() => void insertTemplate(api, service, doc.id).catch(fail)}
                onRename={async (title) => {
                  const result = await service.renameDocument(doc.id, title);
                  upsertDocument(result.document);
                }}
              />
              <Menu
                className="row-menu"
                trigger={<Icon name="mas-opciones" size={18} />}
                label={`${t('library.actions')}: ${doc.title}`}
                triggerClassName="icon-button"
                testId="template-actions"
                placement="bottom-end"
                items={[
                  {
                    id: 'template-rename',
                    label: t('library.rename'),
                    icon: 'editar',
                    onSelect: () => setRenaming((r) => ({ id: doc.id, seq: (r?.seq ?? 0) + 1 })),
                  },
                  {
                    id: 'template-trash',
                    label: t('library.trash'),
                    icon: 'eliminar',
                    danger: true,
                    onSelect: () =>
                      void service
                        .trashDocument(doc.id)
                        .then((result) => upsertDocument(result.document))
                        .catch(fail),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t('templates.hint')}</p>
    </section>
  );
}
