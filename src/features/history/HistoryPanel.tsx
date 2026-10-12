import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import type { HistoryEntry } from '../../ports/VaultRepository.ts';
import { RevisionPreview } from './RevisionPreview.tsx';

interface Props {
  document: DocumentRecord;
  service: VaultService;
  onRestore: (revisionId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Historial de un documento (RF-31, FP-06): lista desde historyIndex sin cargar cuerpos, vista
 * previa de la versión elegida y restauración que conserva la versión actual en el historial.
 */
export function HistoryPanel({ document, service, onRestore, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void service.listHistory(document.id).then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [document.id, document.updatedAt, service]);

  const format = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' });
  const isHead = (id: string) => document.headRevisionIds.includes(id);

  return (
    <aside className="side-panel" aria-label={t('history.title')} data-testid="history-panel">
      <header>
        <h2>{t('history.title')}</h2>
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </header>
      <p className="muted">{t('history.hint')}</p>
      {entries?.length === 1 && <p className="muted">{t('history.empty')}</p>}
      <ol className="history-list">
        {entries?.map((e) => (
          <li key={e.revisionId} className={selected === e.revisionId ? 'selected' : ''}>
            <button
              type="button"
              className="link-button history-item"
              data-testid="history-item"
              onClick={() => setSelected(e.revisionId)}
            >
              <span>{format(e.createdAt)}</span>
              <span className="muted">
                {t(`history.operation.${e.operation}`)}
                {isHead(e.revisionId) ? ` · ${t('history.current')}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {selected && (
        <section className="history-preview">
          <RevisionPreview key={selected} revisionId={selected} service={service} />
          {!isHead(selected) && (
            <button
              type="button"
              disabled={busy}
              data-testid="history-restore"
              onClick={() => {
                setBusy(true);
                onRestore(selected).finally(() => setBusy(false));
              }}
            >
              {t('history.restore')}
            </button>
          )}
        </section>
      )}
    </aside>
  );
}
