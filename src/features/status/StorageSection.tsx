import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppServices } from '../../app/services.ts';
import { useUiStore } from '../../app/store.ts';
import {
  driveConfigured,
  folderPickerSupported,
  type DriveVaultChoice,
  type SyncRuntime,
} from '../../app/syncRuntime.ts';
import { switchVault } from '../../app/vaults.ts';
import type { Vault } from '../../domain/vault.ts';

interface Props {
  services: AppServices;
  sync: SyncRuntime | null;
  onError: (error: unknown) => void;
}

/** Pasos de la conexión con Drive; nada llega a Google antes de «accepted» (RN-12, CA-27). */
type DriveStep =
  | { step: 'warning' }
  | { step: 'loading' }
  | { step: 'ready'; reconnect: boolean }
  | { step: 'choose'; choices: DriveVaultChoice[] };

/**
 * «Dónde se guarda» (plan 4.1, 4.4, RF-41, CA-33): el almacén empieza en el navegador y después
 * se puede conectar a una carpeta o a Google Drive (uno de los dos). Conectar o desconectar
 * nunca borra el origen (§8.4).
 */
export function StorageSection({ services, sync, onError }: Props) {
  const { t, i18n } = useTranslation();
  const remote = useUiStore((s) => s.remote);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<{
    vault: Vault;
    handle: FileSystemDirectoryHandle;
  } | null>(null);
  const [drive, setDrive] = useState<DriveStep | null>(null);

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

  /** Tras aceptar el aviso: carga GIS sin abrir ventanas; la ventana la abre el siguiente clic. */
  const prepareDrive = (reconnect: boolean) =>
    run(async () => {
      setDrive({ step: 'loading' });
      try {
        await sync.prepareDrive();
        setDrive({ step: 'ready', reconnect });
      } catch (error) {
        setDrive(null);
        throw error;
      }
    });

  const authorizeDrive = (reconnect: boolean) =>
    run(async () => {
      if (reconnect) {
        await sync.reconnect();
        setDrive(null);
        return;
      }
      const result = await sync.connectDrive({ acknowledgedUnencryptedContent: true });
      setDrive('choices' in result ? { step: 'choose', choices: result.choices } : null);
    });

  const time = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
      : '—';
  const phases = remote?.kind === 'drive' ? 'drivePhase' : 'phase';

  return (
    <section data-testid="storage-section">
      <h3>{t('storage.title')}</h3>
      {!remote ? (
        <p data-testid="storage-mode">{t('storage.browserOnly')}</p>
      ) : (
        <div data-testid="storage-mode">
          <p>
            {remote.kind === 'drive'
              ? t('storage.drive', { name: remote.name })
              : t('storage.folder', { name: remote.name })}{' '}
            ·{' '}
            <strong data-testid="storage-phase">
              {t(`storage.${phases}.${remote.phase}`, { count: remote.pending })}
            </strong>
          </p>
          <p className="muted small">
            {t(remote.kind === 'drive' ? 'storage.driveLastSync' : 'storage.lastSync', {
              time: time(remote.lastSyncAt),
            })}
          </p>
          {remote.message && <p className="notice small">{remote.message}</p>}
          <div className="startup-actions">
            {remote.phase === 'needs-auth' ? (
              sync.driveReady || drive?.step === 'ready' ? (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="drive-authorize"
                  onClick={() => void authorizeDrive(true)}
                >
                  {t('storage.driveContinue')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="drive-reconnect"
                  onClick={() => void prepareDrive(true)}
                >
                  {t('storage.driveReconnect')}
                </button>
              )
            ) : remote.phase === 'needs-permission' ? (
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

      {!remote && !drive && (
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
          {driveConfigured() ? (
            <button
              type="button"
              disabled={busy}
              data-testid="connect-drive"
              onClick={() => setDrive({ step: 'warning' })}
            >
              {t('storage.connectDrive')}
            </button>
          ) : (
            <p className="muted small" data-testid="drive-pending">
              {t('storage.driveNotConfigured')}
            </p>
          )}
        </>
      )}

      {drive?.step === 'warning' && (
        <div className="notice" role="alertdialog" data-testid="drive-warning">
          <p>
            <strong>{t('storage.driveWarningTitle')}</strong>
          </p>
          <p>{t('storage.driveWarning')}</p>
          <div className="startup-actions">
            <button
              type="button"
              disabled={busy}
              data-testid="drive-accept"
              onClick={() => void prepareDrive(false)}
            >
              {t('storage.driveAccept')}
            </button>
            <button type="button" data-testid="drive-cancel" onClick={() => setDrive(null)}>
              {t('title.cancel')}
            </button>
          </div>
        </div>
      )}

      {drive?.step === 'loading' && <p className="muted small">{t('storage.driveLoading')}</p>}

      {drive?.step === 'ready' && !drive.reconnect && (
        <div className="notice" data-testid="drive-ready">
          <p>{t('storage.driveReady')}</p>
          <div className="startup-actions">
            <button
              type="button"
              disabled={busy}
              data-testid="drive-authorize"
              onClick={() => void authorizeDrive(false)}
            >
              {t('storage.driveContinue')}
            </button>
            <button type="button" onClick={() => setDrive(null)}>
              {t('title.cancel')}
            </button>
          </div>
        </div>
      )}

      {drive?.step === 'choose' && (
        <div className="notice" role="alertdialog" data-testid="drive-choices">
          <p>{t('storage.driveOthers')}</p>
          <ul className="plain-list">
            {drive.choices.map((choice) => (
              <li key={choice.folderId}>
                {choice.vault.name}{' '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const dbName = await sync.openVaultFromDrive(choice);
                      await switchVault(services, dbName);
                    })
                  }
                >
                  {t('storage.openFolderVault')}
                </button>
              </li>
            ))}
          </ul>
          <div className="startup-actions">
            <button
              type="button"
              disabled={busy}
              data-testid="drive-create"
              onClick={() =>
                void run(async () => {
                  await sync.createDriveVault();
                  setDrive(null);
                })
              }
            >
              {t('storage.driveCreate')}
            </button>
            <button type="button" onClick={() => setDrive(null)}>
              {t('title.cancel')}
            </button>
          </div>
        </div>
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
    </section>
  );
}
