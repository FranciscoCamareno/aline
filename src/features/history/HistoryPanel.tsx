import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import type { HistoryEntry, VersionSpace } from '../../ports/VaultRepository.ts';
import { formatBytes } from '../status/StatusPanel.tsx';
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
 * Desde el plan 9.20 (RF-46): espacio que ocupan las versiones, lo que liberaría cada una y
 * eliminar una versión concreta o las anteriores a ella, siempre con confirmación (RN-13).
 */
export function HistoryPanel({ document, service, onRestore, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [space, setSpace] = useState<VersionSpace | null>(null);
  /** Se vuelve a leer tras eliminar versiones (la versión vigente no cambia). */
  const [reload, setReload] = useState(0);
  const [freed, setFreed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([service.listHistory(document.id), service.versionSpace(document.id)]).then(
      ([list, bytes]) => {
        if (cancelled) return;
        setEntries(list);
        setSpace(bytes);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [document.id, document.updatedAt, service, reload]);

  const format = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' });
  const isHead = (id: string) => document.headRevisionIds.includes(id);
  const bytes = (n: number) => formatBytes(n, '—');

  /** Elimina versiones (nunca la vigente) tras confirmarlo. */
  const prune = async (ids: string[], question: string) => {
    const targets = ids.filter((id) => !isHead(id));
    if (!targets.length || !window.confirm(question)) return;
    setBusy(true);
    try {
      const result = await service.pruneVersions(document.id, targets);
      setFreed(result.freedBytes);
      setSelected(null);
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };
  const selectedIndex = entries?.findIndex((e) => e.revisionId === selected) ?? -1;
  /** Versiones anteriores a la elegida (la lista va de la más reciente a la más antigua). */
  const older = selectedIndex >= 0 ? (entries ?? []).slice(selectedIndex + 1) : [];
  const olderCount = older.filter((e) => !isHead(e.revisionId)).length;

  return (
    <aside className="side-panel" aria-label={t('history.title')} data-testid="history-panel">
      <header>
        <h2>{t('history.title')}</h2>
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </header>
      <p className="muted">{t('history.hint')}</p>
      {space && entries && (
        <p className="history-space" data-testid="history-space">
          {t('history.space', { size: bytes(space.totalBytes), count: entries.length })}
        </p>
      )}
      {freed !== null && (
        <p className="notice small" role="status" data-testid="history-freed">
          {t('history.freed', { size: bytes(freed) })}
        </p>
      )}
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
                {!isHead(e.revisionId) && space?.freeableBytes[e.revisionId]
                  ? ` · ${bytes(space.freeableBytes[e.revisionId]!)}`
                  : ''}
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
          {!isHead(selected) && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              data-testid="history-prune"
              onClick={() => void prune([selected], t('history.pruneConfirm'))}
            >
              {t('history.prune')}
            </button>
          )}
          {olderCount > 0 && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              data-testid="history-prune-older"
              onClick={() =>
                void prune(
                  older.map((e) => e.revisionId),
                  t('history.pruneOlderConfirm', { count: olderCount }),
                )
              }
            >
              {t('history.pruneOlder', { count: olderCount })}
            </button>
          )}
        </section>
      )}
    </aside>
  );
}
