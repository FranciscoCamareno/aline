import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppServices } from '../../app/services.ts';
import { useUiStore } from '../../app/store.ts';
import { folderPickerSupported, type SyncRuntime } from '../../app/syncRuntime.ts';
import { switchVault } from '../../app/vaults.ts';
import type { Vault } from '../../domain/vault.ts';

interface Props {
  services: AppServices;
  sync: SyncRuntime | null;
  onError: (error: unknown) => void;
}

/**
 * «Dónde se guarda» (plan 4.1, RF-41, CA-33): el almacén empieza en el navegador y después se
 * puede conectar a una carpeta. Conectar o desconectar nunca borra el origen (§8.4).
 */
export function StorageSection({ services, sync, onError }: Props) {
  const { t, i18n } = useTranslation();
  const remote = useUiStore((s) => s.remote);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<{
    vault: Vault;
    handle: FileSystemDirectoryHandle;
  } | null>(null);
  const driveConfigured = Boolean(import.meta.env['VITE_GOOGLE_CLIENT_ID']);

  if (services.temporary || !sync) return null;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      // Cancelar el selector de carpetas no es un error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) onError(error);
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const result = await sync.connectFolder();
      if ('mismatch' in result) setMismatch({ vault: result.mismatch, handle: result.handle });
    });

  const time = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
      : '—';

  return (
    <section data-testid="storage-section">
      <h3>{t('storage.title')}</h3>
      {!remote ? (
        <p data-testid="storage-mode">{t('storage.browserOnly')}</p>
      ) : (
        <div data-testid="storage-mode">
          <p>
            {t('storage.folder', { name: remote.name })} ·{' '}
            <strong data-testid="storage-phase">
              {t(`storage.phase.${remote.phase}`, { count: remote.pending })}
            </strong>
          </p>
          <p className="muted small">{t('storage.lastSync', { time: time(remote.lastSyncAt) })}</p>
          {remote.message && <p className="notice small">{remote.message}</p>}
          <div className="startup-actions">
            {remote.phase === 'needs-permission' ? (
              <button
                type="button"
                disabled={busy}
                data-testid="folder-reconnect"
                onClick={() => void run(() => sync.reconnect())}
              >
                {t('storage.reconnect')}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                data-testid="folder-sync"
                onClick={() => void run(() => sync.sync())}
              >
                {t('storage.syncNow')}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void run(() => sync.disconnect())}>
              {t('storage.disconnect')}
            </button>
          </div>
        </div>
      )}

      {!remote && (
        <>
          {folderPickerSupported() ? (
            <button
              type="button"
              disabled={busy}
              data-testid="connect-folder"
              onClick={() => void connect()}
            >
              {t('storage.connectFolder')}
            </button>
          ) : (
            <p className="muted small">{t('storage.folderUnsupported')}</p>
          )}
          <p className="muted small">{t('storage.folderHint')}</p>
        </>
      )}

      {mismatch && (
        <div className="notice" role="alertdialog" data-testid="folder-mismatch">
          <p>
            {t('storage.mismatch', { folder: mismatch.handle.name, vault: mismatch.vault.name })}
          </p>
          <div className="startup-actions">
            <button
              type="button"
              disabled={busy}
              data-testid="open-folder-vault"
              onClick={() =>
                void run(async () => {
                  const dbName = await sync.openVaultFromFolder(mismatch.handle, mismatch.vault);
                  await switchVault(services, dbName);
                })
              }
            >
              {t('storage.openFolderVault')}
            </button>
            <button type="button" onClick={() => setMismatch(null)}>
              {t('title.cancel')}
            </button>
          </div>
        </div>
      )}

      <p className="muted small" data-testid="drive-pending">
        {driveConfigured ? t('storage.driveNotImplemented') : t('storage.driveNotConfigured')}
      </p>
    </section>
  );
}
