import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { hasConflict } from '../../domain/revision.ts';
import { RenameableTitle } from '../library/RenameableTitle.tsx';

interface Props {
  onCreateDoc: () => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onTrash: (documentId: string) => Promise<void>;
}

/**
 * Sección «Documentos» de la barra lateral: «Nuevo documento» (el botón principal de la
 * sección) y la lista de documentos de texto enriquecido, del más reciente al más antiguo.
 */
export function DocsSidebar({ onCreateDoc, onRename, onTrash }: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const activeId = useUiStore((s) => s.activeId);
  const setActive = useUiStore((s) => s.setActive);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);
  // `documents` ya llega ordenado por actividad reciente.
  const list = documents.filter((d) => d.kind === 'doc' && !d.deleted);
  /** En pantallas estrechas la barra tapa el documento: abrir uno la cierra. */
  const closeIfNarrow = () => {
    if (window.matchMedia('(max-width: 820px)').matches) toggleLibrary();
  };

  return (
    <div className="docs-sidebar">
      <button
        type="button"
        className="primary new-doc"
        data-testid="new-doc"
        onClick={() => void onCreateDoc().then(closeIfNarrow)}
      >
        <Icon name="mas" size={18} />
        {t('docs.new')}
      </button>

      <h3 className="section-title">{t('docs.all')}</h3>
      {list.length === 0 ? (
        <p className="muted small">{t('docs.emptyList')}</p>
      ) : (
        <ul className="library-list" data-testid="docs-list">
          {list.map((doc) => (
            <li
              key={doc.id}
              className={doc.id === activeId ? 'active' : ''}
              data-testid="doc-item"
              data-document-id={doc.id}
            >
              <span className="kind-label" role="img" aria-label={t('docs.kind')}>
                <KindIcon kind="doc" on={doc.id === activeId} />
              </span>
              <RenameableTitle
                title={doc.title}
                testId="doc-title"
                showRenameButton={false}
                editRequest={renaming?.id === doc.id ? renaming.seq : 0}
                onOpen={() => {
                  setActive(doc.id);
                  closeIfNarrow();
                }}
                onRename={(title) => onRename(doc.id, title)}
              />
              {hasConflict(doc) && <span className="badge">{t('library.conflict')}</span>}
              <Menu
                className="row-menu"
                trigger={<Icon name="mas-opciones" size={18} />}
                label={`${t('library.actions')}: ${doc.title}`}
                triggerClassName="icon-button"
                testId="doc-actions"
                placement="bottom-end"
                items={[
                  {
                    id: 'doc-rename',
                    label: t('library.rename'),
                    icon: 'editar',
                    onSelect: () => setRenaming((r) => ({ id: doc.id, seq: (r?.seq ?? 0) + 1 })),
                  },
                  {
                    id: 'doc-trash',
                    label: t('library.trash'),
                    icon: 'eliminar',
                    danger: true,
                    onSelect: () => void onTrash(doc.id),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
