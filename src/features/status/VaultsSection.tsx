import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultEntry } from '../../adapters/indexeddb/registry.ts';
import type { AppServices } from '../../app/services.ts';
import {
  contentBytes,
  createVault,
  downloadBackup,
  restoreFromFile,
  switchVault,
  type RestoreReport,
} from '../../app/vaults.ts';
import { LARGE_BACKUP_BYTES } from '../../application/backup.ts';

interface Props {
  services: AppServices;
  onError: (error: unknown) => void;
}

/** Almacenes de este navegador, copia completa ZIP y restauración en un almacén nuevo. */
export function VaultsSection({ services, onError }: Props) {
  const { t } = useTranslation();
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void services.registry?.list().then((list) => !cancelled && setVaults(list));
    return () => {
      cancelled = true;
    };
  }, [services, report]);

  if (!services.registry) return null;

  const backup = async () => {
    setBusy('backup');
    try {
      const size = contentBytes(await services.service.exportContent());
      if (
        size > LARGE_BACKUP_BYTES &&
        !window.confirm(t('vaults.largeBackup', { mb: Math.round(size / 1024 ** 2) }))
      ) {
        return;
      }
      await downloadBackup(services);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: File) => {
    setBusy('restore');
    setReport(null);
    try {
      setReport(await restoreFromFile(services, file));
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section data-testid="vaults-section">
      <h3>{t('vaults.title')}</h3>
      <ul className="vault-list">
        {vaults.map((v) => (
          <li key={v.dbName} data-testid="vault-item">
            <span>
              <strong>{v.name}</strong>
              <span className="muted mono"> {v.vaultId?.slice(0, 8) ?? ''}</span>
              {v.dbName === services.dbName && (
                <span className="badge-ok"> {t('vaults.current')}</span>
              )}
            </span>
            {v.dbName !== services.dbName && (
              <button type="button" onClick={() => void switchVault(services, v.dbName)}>
                {t('vaults.open')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) void createVault(services, newName).catch(onError);
        }}
      >
        <input
          name="vault-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('vaults.newPlaceholder')}
          aria-label={t('vaults.newPlaceholder')}
          maxLength={120}
        />
        <button type="submit" disabled={!newName.trim()}>
          {t('vaults.create')}
        </button>
      </form>

      <h3>{t('vaults.backupTitle')}</h3>
      <p className="muted">{t('vaults.backupHint')}</p>
      <button
        type="button"
        disabled={busy !== null}
        data-testid="backup-zip"
        onClick={() => void backup()}
      >
        {busy === 'backup' ? t('vaults.working') : t('vaults.backup')}
      </button>

      <p className="muted">{t('vaults.restoreHint')}</p>
      <label className="file-button">
        {busy === 'restore' ? t('vaults.working') : t('vaults.restore')}
        <input
          name="restore-file"
          type="file"
          accept=".zip,.json,application/zip,application/json"
          disabled={busy !== null}
          data-testid="restore-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void restore(file);
          }}
        />
      </label>

      {report && (
        <div className="notice restore-report" role="status" data-testid="restore-report">
          <p>
            {t('vaults.restored', {
              name: report.entry.name,
              documents: report.documents,
              revisions: report.revisions,
              blobs: report.blobs,
            })}
          </p>
          <p>{report.identical ? t('vaults.identical') : t('vaults.notIdentical')}</p>
          {report.problems.length > 0 && (
            <p>{t('vaults.problems', { count: report.problems.length })}</p>
          )}
          <button
            type="button"
            data-testid="open-restored"
            onClick={() => void switchVault(services, report.entry.dbName)}
          >
            {t('vaults.openRestored')}
          </button>
        </div>
      )}
    </section>
  );
}
