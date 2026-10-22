import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadText } from '../../app/download.ts';
import { generateRecoveryCode, WrongSecretError } from '../../app/syncRuntime.ts';
import { MIN_PASSWORD_LENGTH, type DriveEncryptionChoice } from '../../domain/encryption.ts';
import { problemOf, syncErrorKey } from './syncErrors.ts';

type Mode = DriveEncryptionChoice['mode'];

/**
 * Elección del modo de Drive (diseño §13.1): sin cifrar, con el aviso RN-12, o cifrado, con el
 * aviso de que una contraseña perdida no se puede recuperar. Ninguna opción viene marcada. Con
 * `only`, se muestra solo el modo de destino (cambio de modo desde la configuración).
 */
export function DriveModeChooser({
  only,
  connecting,
  busy,
  onConfirm,
  onCancel,
}: {
  only?: Mode;
  /** Al conectar por primera vez: se explica que aún no se ha contactado con Google. */
  connecting: boolean;
  busy: boolean;
  onConfirm: (choice: DriveEncryptionChoice) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode | null>(only ?? null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);

  const passwordOk = password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  if (recovery) {
    return (
      <RecoveryCodeStep
        code={recovery}
        busy={busy}
        onDone={() => onConfirm({ mode: 'encrypted', password, recoveryCode: recovery })}
        onCancel={onCancel}
      />
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'plain') onConfirm({ mode: 'plain' });
    else if (mode === 'encrypted' && passwordOk) setRecovery(generateRecoveryCode());
  };

  return (
    <form
      className="notice drive-mode"
      role="alertdialog"
      data-testid="drive-warning"
      onSubmit={submit}
    >
      <p>
        <strong>{t(only ? 'storage.enc.switchTitle' : 'storage.driveWarningTitle')}</strong>
      </p>
      {(!only || only === 'plain') && (
        <label className="drive-mode-option">
          {!only && (
            <input
              type="radio"
              name="drive-mode"
              data-testid="drive-mode-plain"
              checked={mode === 'plain'}
              onChange={() => setMode('plain')}
            />
          )}
          <span>
            <strong>{t('storage.enc.plainTitle')}</strong>
            <span className="small">{t('storage.driveWarning')}</span>
          </span>
        </label>
      )}
      {(!only || only === 'encrypted') && (
        <label className="drive-mode-option">
          {!only && (
            <input
              type="radio"
              name="drive-mode"
              data-testid="drive-mode-encrypted"
              checked={mode === 'encrypted'}
              onChange={() => setMode('encrypted')}
            />
          )}
          <span>
            <strong>{t('storage.enc.encryptedTitle')}</strong>
            <span className="small">{t('storage.enc.encryptedWarning')}</span>
          </span>
        </label>
      )}
      {mode === 'encrypted' && (
        <div className="drive-password">
          <label>
            {t('storage.enc.password', { min: MIN_PASSWORD_LENGTH })}
            <input
              name="drive-password"
              type="password"
              autoComplete="new-password"
              data-testid="drive-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            {t('storage.enc.confirm')}
            <input
              name="drive-password-confirm"
              type="password"
              autoComplete="new-password"
              data-testid="drive-password-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {confirm && password !== confirm && (
            <p className="small notice">{t('storage.enc.mismatch')}</p>
          )}
        </div>
      )}
      {only === 'encrypted' && <p className="small muted">{t('storage.enc.switchToEncrypted')}</p>}
      {only === 'plain' && <p className="small muted">{t('storage.enc.switchToPlain')}</p>}
      {connecting && <p className="small muted">{t('storage.driveNoRequestsYet')}</p>}
      <div className="startup-actions">
        <button
          type="submit"
          disabled={busy || !mode || (mode === 'encrypted' && !passwordOk)}
          data-testid="drive-accept"
        >
          {t('storage.driveAccept')}
        </button>
        <button type="button" data-testid="drive-cancel" onClick={onCancel}>
          {t('title.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Muestra el código de recuperación y exige confirmar que se guardó antes de usarlo. */
function RecoveryCodeStep({
  code,
  busy,
  onDone,
  onCancel,
}: {
  code: string;
  busy: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  return (
    <div className="notice" role="alertdialog" data-testid="drive-recovery">
      <p>
        <strong>{t('storage.enc.recoveryTitle')}</strong>
      </p>
      <p className="small">{t('storage.enc.recoveryText')}</p>
      <p className="recovery-code" data-testid="drive-recovery-code">
        {code}
      </p>
      <div className="startup-actions">
        <button
          type="button"
          onClick={() =>
            downloadText(
              'codigo-recuperacion-aline.txt',
              `${t('storage.enc.recoveryFile')}\n\n${code}\n`,
              'text/plain',
            )
          }
        >
          {t('storage.enc.download')}
        </button>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(code)}>
          {t('storage.enc.copy')}
        </button>
      </div>
      <label className="small">
        <input
          name="drive-recovery-saved"
          type="checkbox"
          data-testid="drive-recovery-saved"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />{' '}
        {t('storage.enc.recoverySaved')}
      </label>
      <div className="startup-actions">
        <button
          type="button"
          disabled={!saved || busy}
          data-testid="drive-recovery-done"
          onClick={onDone}
        >
          {t('storage.driveAccept')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('title.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Contraseña o código de recuperación para usar en este equipo un almacén cifrado. */
export function DriveUnlock({ onUnlock }: { onUnlock: (secret: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onUnlock(secret);
      setSecret('');
    } catch (e) {
      setError(t(e instanceof WrongSecretError ? 'storage.enc.wrong' : syncErrorKey(problemOf(e))));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="notice" data-testid="drive-unlock" onSubmit={(e) => void submit(e)}>
      <p className="small">{t('storage.enc.unlockText')}</p>
      <input
        name="drive-unlock-secret"
        type="password"
        autoComplete="current-password"
        data-testid="drive-unlock-secret"
        aria-label={t('storage.enc.unlockLabel')}
        placeholder={t('storage.enc.unlockLabel')}
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
      />
      {error && <p className="small notice">{error}</p>}
      <div className="startup-actions">
        <button type="submit" disabled={busy || !secret} data-testid="drive-unlock-submit">
          {t('storage.enc.unlock')}
        </button>
      </div>
    </form>
  );
}

/** Contraseña y código de recuperación de un almacén cifrado (configuración). */
export function DriveSecrets({
  busy,
  onChangePassword,
  onReplaceRecovery,
}: {
  busy: boolean;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onReplaceRecovery: (current: string, code: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<'password' | 'recovery' | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reset = () => {
    setOpen(null);
    setCurrent('');
    setNext('');
    setConfirm('');
    setCode(null);
  };
  const guard = async (task: () => Promise<void>, done: string) => {
    try {
      await task();
      reset();
      setMessage(done);
    } catch (e) {
      setMessage(
        t(e instanceof WrongSecretError ? 'storage.enc.wrong' : syncErrorKey(problemOf(e))),
      );
    }
  };

  if (code) {
    return (
      <RecoveryCodeStep
        code={code}
        busy={busy}
        onCancel={reset}
        onDone={() =>
          void guard(() => onReplaceRecovery(current, code), t('storage.enc.recoveryReplaced'))
        }
      />
    );
  }
  return (
    <div className="drive-secrets">
      {message && <p className="small notice">{message}</p>}
      {!open && (
        <div className="startup-actions">
          <button
            type="button"
            data-testid="drive-change-password"
            onClick={() => setOpen('password')}
          >
            {t('storage.enc.changePassword')}
          </button>
          <button type="button" onClick={() => setOpen('recovery')}>
            {t('storage.enc.newRecovery')}
          </button>
        </div>
      )}
      {open && (
        <form
          className="drive-password"
          onSubmit={(e) => {
            e.preventDefault();
            if (open === 'recovery') setCode(generateRecoveryCode());
            else
              void guard(() => onChangePassword(current, next), t('storage.enc.passwordChanged'));
          }}
        >
          <label>
            {t('storage.enc.current')}
            <input
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          {open === 'password' && (
            <>
              <label>
                {t('storage.enc.password', { min: MIN_PASSWORD_LENGTH })}
                <input
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <label>
                {t('storage.enc.confirm')}
                <input
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            </>
          )}
          <div className="startup-actions">
            <button
              type="submit"
              disabled={
                busy ||
                !current ||
                (open === 'password' && (next.length < MIN_PASSWORD_LENGTH || next !== confirm))
              }
            >
              {t('storage.driveAccept')}
            </button>
            <button type="button" onClick={reset}>
              {t('title.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
