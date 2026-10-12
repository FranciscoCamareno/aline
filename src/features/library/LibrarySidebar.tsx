import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import type { DocumentKind } from '../../domain/revision.ts';
import { hasConflict } from '../../domain/revision.ts';
import { RenameableTitle } from './RenameableTitle.tsx';

interface Props {
  onCreate: (kind: DocumentKind) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onTrash: (documentId: string) => Promise<void>;
  onRestoreFromTrash: (documentId: string) => Promise<void>;
  onPurge: (documentId: string) => Promise<void>;
}

/**
 * Biblioteca: documentos recientes primero y papelera recuperable (RN-03).
 * Carpetas, etiquetas y búsqueda están PENDIENTES (fase 3).
 */
export function LibrarySidebar({
  onCreate,
  onRename,
  onTrash,
  onRestoreFromTrash,
  onPurge,
}: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const activeId = useUiStore((s) => s.activeId);
  const setActive = useUiStore((s) => s.setActive);
  const [trashOpen, setTrashOpen] = useState(false);
  const live = documents.filter((d) => !d.deleted);
  const trashed = documents.filter((d) => d.deleted);

  const kindIcon = (kind: DocumentKind) => (
    <span
      className="kind-icon"
      role="img"
      aria-label={kind === 'canvas' ? t('library.kindCanvas') : t('library.kindNote')}
    >
      {kind === 'canvas' ? '◇' : '¶'}
    </span>
  );

  return (
    <nav className="library" aria-label={t('library.title')}>
      <h2>{t('library.title')}</h2>
      <div className="library-actions">
        <button type="button" data-testid="new-canvas" onClick={() => void onCreate('canvas')}>
          + {t('library.newCanvas')}
        </button>
        <button type="button" data-testid="new-note" onClick={() => void onCreate('note')}>
          + {t('library.newNote')}
        </button>
      </div>
      {live.length === 0 ? (
        <p className="muted">{t('library.empty')}</p>
      ) : (
        <ul className="library-list" data-testid="library-list">
          {live.map((doc) => (
            <li
              key={doc.id}
              className={doc.id === activeId ? 'active' : ''}
              data-testid="library-item"
              data-document-id={doc.id}
            >
              {kindIcon(doc.kind)}
              <RenameableTitle
                title={doc.title}
                testId="library-title"
                onOpen={() => setActive(doc.id)}
                onRename={(title) => onRename(doc.id, title)}
              />
              {hasConflict(doc) && <span className="badge">{t('library.conflict')}</span>}
              <button
                type="button"
                className="icon-button"
                aria-label={`${t('library.trash')}: ${doc.title}`}
                title={t('library.trash')}
                data-testid="library-trash"
                onClick={() => void onTrash(doc.id)}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="trash">
        <button
          type="button"
          className="link-button"
          aria-expanded={trashOpen}
          data-testid="trash-toggle"
          onClick={() => setTrashOpen((v) => !v)}
        >
          {t('library.trashTitle', { count: trashed.length })}
        </button>
        {trashOpen && (
          <ul className="library-list trash-list" data-testid="trash-list">
            {trashed.length === 0 && <li className="muted">{t('library.trashEmpty')}</li>}
            {trashed.map((doc) => (
              <li key={doc.id} data-testid="trash-item" data-document-id={doc.id}>
                {kindIcon(doc.kind)}
                <span className="renameable-text">{doc.title}</span>
                <button
                  type="button"
                  data-testid="trash-restore"
                  onClick={() => void onRestoreFromTrash(doc.id)}
                >
                  {t('library.restore')}
                </button>
                <button
                  type="button"
                  className="danger"
                  data-testid="trash-purge"
                  onClick={() => {
                    if (window.confirm(t('library.purgeConfirm', { title: doc.title }))) {
                      void onPurge(doc.id);
                    }
                  }}
                >
                  {t('library.purge')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
