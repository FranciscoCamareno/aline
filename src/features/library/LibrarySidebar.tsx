import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import type { DocumentKind } from '../../domain/revision.ts';
import { hasConflict } from '../../domain/revision.ts';
import { RenameableTitle } from './RenameableTitle.tsx';

interface Props {
  onCreate: (kind: DocumentKind) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
}

/**
 * Biblioteca: documentos recientes primero. Carpetas, etiquetas y búsqueda están PENDIENTES.
 */
export function LibrarySidebar({ onCreate, onRename }: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const activeId = useUiStore((s) => s.activeId);
  const setActive = useUiStore((s) => s.setActive);

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
      {documents.length === 0 ? (
        <p className="muted">{t('library.empty')}</p>
      ) : (
        <ul className="library-list" data-testid="library-list">
          {documents
            .filter((d) => !d.deleted)
            .map((doc) => (
              <li
                key={doc.id}
                className={doc.id === activeId ? 'active' : ''}
                data-testid="library-item"
                data-document-id={doc.id}
              >
                <span
                  className="kind-icon"
                  role="img"
                  aria-label={
                    doc.kind === 'canvas' ? t('library.kindCanvas') : t('library.kindNote')
                  }
                >
                  {doc.kind === 'canvas' ? '◇' : '¶'}
                </span>
                <RenameableTitle
                  title={doc.title}
                  testId="library-title"
                  onOpen={() => setActive(doc.id)}
                  onRename={(title) => onRename(doc.id, title)}
                />
                {hasConflict(doc) && <span className="badge">{t('library.conflict')}</span>}
              </li>
            ))}
        </ul>
      )}
    </nav>
  );
}
