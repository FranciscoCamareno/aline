import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';
import type { AppServices } from '../../app/services.ts';
import { useUiStore } from '../../app/store.ts';
import {
  driveConfigured,
  folderPickerSupported,
  type DriveVaultChoice,
  type SyncRuntime,
} from '../../app/syncRuntime.ts';
import { switchVault } from '../../app/vaults.ts';
import type { DriveEncryptionChoice } from '../../domain/encryption.ts';
import type { Vault } from '../../domain/vault.ts';
import { DriveModeChooser, DriveSecrets, DriveUnlock } from './DriveEncryption.tsx';
import { GoogleButton } from './GoogleButton.tsx';
import { syncErrorKey } from './syncErrors.ts';

interface Props {
  services: AppServices;
  sync: SyncRuntime | null;
  onError: (error: unknown) => void;
}

/**
 * Pasos de la conexión con Drive. Nada llega a Google antes de elegir el modo (cifrado o no) y
 * aceptar su aviso (RN-12, CA-27, diseño §13.1).
 */
type DriveStep =
  | { step: 'mode' }
  | { step: 'loading' }
  | { step: 'ready'; choice: DriveEncryptionChoice | null }
  | { step: 'choose'; choices: DriveVaultChoice[]; choice: DriveEncryptionChoice }
  /** Se eligió cifrar y Drive ya tiene este almacén sin cifrar: nada se ha publicado aún. */
  | { step: 'existing-plain'; existing: DriveVaultChoice; choice: DriveEncryptionChoice }
  | { step: 'switch'; target: DriveEncryptionChoice['mode'] }
  /** Fase needs-confirm: volver a cifrar en una carpeta nueva en lugar de aceptar la sin cifrar. */
  | { step: 'reencrypt' };

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
  const [notice, setNotice] = useState<string | null>(null);

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

  /** Tras elegir el modo: carga GIS sin abrir ventanas; la ventana la abre el siguiente clic. */
  const prepareDrive = (choice: DriveEncryptionChoice | null) =>
    run(async () => {
      setDrive({ step: 'loading' });
      try {
        await sync.prepareDrive();
        setDrive({ step: 'ready', choice });
      } catch (error) {
        setDrive(null);
        throw error;
      }
    });

  /** `choice` null: reautorizar una conexión existente (su modo ya se eligió). */
  const authorizeDrive = (choice: DriveEncryptionChoice | null) =>
    run(async () => {
      if (!choice) {
        await sync.reconnect();
        setDrive(null);
        return;
      }
      const result = await sync.connectDrive(choice);
      if ('choices' in result) {
        setDrive({ step: 'choose', choices: result.choices, choice });
        return;
      }
      if ('existingPlain' in result) {
        setDrive({ step: 'existing-plain', existing: result.existingPlain, choice });
        return;
      }
      setDrive(null);
      setNotice(result.notice ? t(`storage.enc.${result.notice}`) : null);
    });

  const time = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
      : '—';
  const phases = remote?.kind === 'drive' ? 'drivePhase' : 'phase';
  const driveActive =
    remote?.kind === 'drive' &&
    remote.phase !== 'needs-auth' &&
    remote.phase !== 'needs-key' &&
    remote.phase !== 'needs-confirm';

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
          {remote.kind === 'drive' && (
            <p className="small" data-testid="drive-encryption-mode">
              {remote.encrypted && <Icon name="candado" size={16} />}
              {remote.encrypted ? t('storage.enc.modeEncrypted') : t('storage.enc.modePlain')}
            </p>
          )}
          <p className="muted small">
            {t(remote.kind === 'drive' ? 'storage.driveLastSync' : 'storage.lastSync', {
              time: time(remote.lastSyncAt),
            })}
          </p>
          {remote.problem && (
            <p className="notice small" data-testid="remote-problem">
              {t(syncErrorKey(remote.problem))}
            </p>
          )}
          {notice && <p className="notice small">{notice}</p>}
          {remote.phase === 'needs-key' && (
            <DriveUnlock onUnlock={(secret) => sync.unlockDrive(secret)} />
          )}
          <div className="startup-actions">
            {remote.phase === 'needs-auth' ? (
              sync.driveReady || drive?.step === 'ready' ? (
                <GoogleButton
                  disabled={busy}
                  testId="drive-authorize"
                  onClick={() => void authorizeDrive(null)}
                >
                  {t('storage.driveContinue')}
                </GoogleButton>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="drive-reconnect"
                  onClick={() => void prepareDrive(null)}
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
            ) : remote.phase !== 'needs-key' ? (
              <button
                type="button"
                // También mientras sincroniza el propio proceso (al cambiar algo, al volver a la
                // pestaña…) o cuando se pidió antes de cerrar y reabrir este panel.
                disabled={busy || remote.phase === 'syncing'}
                data-testid="folder-sync"
                onClick={() => void run(() => sync.sync())}
              >
                {remote.phase === 'syncing' ? t('storage.driveChip.syncing') : t('storage.syncNow')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              data-testid="storage-disconnect"
              onClick={() =>
                void run(async () => {
                  const result = await sync.disconnect();
                  setDrive(null);
                  // Desvincular no retira el permiso en la cuenta si Google no lo confirma.
                  setNotice(result && !result.revoked ? t('storage.revokeUnconfirmed') : null);
                })
              }
            >
              {t('storage.disconnect')}
            </button>
          </div>

          {remote.phase === 'needs-confirm' && drive?.step !== 'reencrypt' && (
            <div className="notice small" role="alertdialog" data-testid="drive-relocate-plain">
              <p>{t('storage.enc.relocatePlain')}</p>
              <div className="startup-actions">
                <button
                  type="button"
                  disabled={busy}
                  data-testid="drive-relocate-reencrypt"
                  onClick={() => setDrive({ step: 'reencrypt' })}
                >
                  {t('storage.enc.relocateReencrypt')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  data-testid="drive-relocate-accept"
                  onClick={() => void run(() => sync.acceptPlainRelocation())}
                >
                  {t('storage.enc.relocateAccept')}
                </button>
              </div>
            </div>
          )}

          {remote.kind === 'drive' && remote.previousFolder && (
            <div className="notice small" data-testid="drive-previous">
              <p>{t('storage.enc.previousFolder')}</p>
              <div className="startup-actions">
                <button
                  type="button"
                  disabled={busy}
                  data-testid="drive-trash-previous"
                  onClick={() => void run(() => sync.trashPreviousDriveFolder())}
                >
                  {t('storage.enc.trashPrevious')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => sync.forgetPreviousDriveFolder())}
                >
                  {t('storage.enc.keepPrevious')}
                </button>
              </div>
            </div>
          )}

          {driveActive && drive?.step !== 'switch' && (
            <details className="drive-settings" data-testid="drive-settings">
              <summary>{t('storage.enc.settings')}</summary>
              {remote.encrypted && (
                <DriveSecrets
                  busy={busy}
                  onChangePassword={(current, next) => sync.changeDrivePassword(current, next)}
                  onReplaceRecovery={(current, code) => sync.replaceRecoveryCode(current, code)}
                />
              )}
              <button
                type="button"
                disabled={busy || remote.previousFolder}
                data-testid="drive-switch-mode"
                onClick={() =>
                  setDrive({ step: 'switch', target: remote.encrypted ? 'plain' : 'encrypted' })
                }
              >
                {remote.encrypted ? t('storage.enc.toPlain') : t('storage.enc.toEncrypted')}
              </button>
            </details>
          )}
        </div>
      )}

      {!remote && notice && (
        <p className="notice small" data-testid="storage-notice">
          {notice}
        </p>
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
            <GoogleButton
              disabled={busy}
              testId="connect-drive"
              onClick={() => setDrive({ step: 'mode' })}
            >
              {t('storage.connectDrive')}
            </GoogleButton>
          ) : (
            <p className="muted small" data-testid="drive-pending">
              {t('storage.driveNotConfigured')}
            </p>
          )}
        </>
      )}

      {drive?.step === 'mode' && (
        <DriveModeChooser
          connecting
          busy={busy}
          onConfirm={(choice) => void prepareDrive(choice)}
          onCancel={() => setDrive(null)}
        />
      )}

      {drive?.step === 'switch' && (
        <DriveModeChooser
          only={drive.target}
          connecting={false}
          busy={busy}
          onConfirm={(choice) =>
            void run(async () => {
              await sync.switchDriveMode(choice);
              setDrive(null);
            })
          }
          onCancel={() => setDrive(null)}
        />
      )}

      {drive?.step === 'reencrypt' && (
        <DriveModeChooser
          only="encrypted"
          connecting={false}
          busy={busy}
          onConfirm={(choice) =>
            void run(async () => {
              await sync.reencryptAfterPlainRelocation(choice);
              setDrive(null);
            })
          }
          onCancel={() => setDrive(null)}
        />
      )}

      {drive?.step === 'existing-plain' && (
        <div className="notice" role="alertdialog" data-testid="drive-existing-plain">
          <p>{t('storage.enc.existingPlain')}</p>
          <div className="startup-actions">
            <button
              type="button"
              disabled={busy}
              data-testid="drive-existing-plain-encrypt"
              onClick={() =>
                void run(async () => {
                  await sync.createDriveVault(drive.choice, drive.existing.folderId);
                  setDrive(null);
                })
              }
            >
              {t('storage.enc.existingPlainEncrypt')}
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="drive-existing-plain-use"
              onClick={() =>
                void run(async () => {
                  await sync.useExistingPlainDrive(drive.existing);
                  setDrive(null);
                })
              }
            >
              {t('storage.enc.existingPlainUse')}
            </button>
            <button type="button" onClick={() => setDrive(null)}>
              {t('title.cancel')}
            </button>
          </div>
        </div>
      )}

      {drive?.step === 'loading' && <p className="muted small">{t('storage.driveLoading')}</p>}

      {drive?.step === 'ready' && drive.choice && (
        <div className="notice" data-testid="drive-ready">
          <p>{t('storage.driveReady')}</p>
          <div className="startup-actions">
            <GoogleButton
              disabled={busy}
              testId="drive-authorize"
              onClick={() => void authorizeDrive(drive.choice)}
            >
              {t('storage.driveContinue')}
            </GoogleButton>
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
                {choice.vault.name}
                {choice.encrypted ? ` · ${t('storage.enc.encryptedShort')}` : ''}{' '}
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
                  await sync.createDriveVault(drive.choice);
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
