import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { describeError } from '../ports/Diagnostics.ts';
import { logDiagnostic } from './runtime.ts';

interface Props {
  /**
   * Guarda todo lo pendiente y pausa los trabajadores. Si se rechaza, la actualización no se
   * aplica: no se activa un Service Worker nuevo en mitad de una escritura (diseño §14.4).
   */
  beforeUpdate: () => Promise<void>;
}

/** Actualización controlada: el nuevo Service Worker solo se activa cuando el propietario lo pide. */
export function PwaPrompt({ beforeUpdate }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'idle' | 'saving' | 'failed'>('idle');
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
    setPhase('idle');
  };

  const update = async () => {
    setPhase('saving');
    try {
      await beforeUpdate();
    } catch (error) {
      logDiagnostic('error', 'update-aborted', describeError(error));
      setPhase('failed');
      return;
    }
    logDiagnostic('info', 'update-applied', `desde v${__APP_VERSION__}`);
    await updateServiceWorker(true);
  };

  const message =
    phase === 'saving'
      ? t('pwa.updating')
      : phase === 'failed'
        ? t('pwa.updateFailed')
        : needRefresh
          ? t('pwa.updateAvailable')
          : t('pwa.offlineReady');

  return (
    <div className="toast pwa-toast" role="status">
      <span>{message}</span>
      {needRefresh && phase !== 'saving' && (
        <button type="button" onClick={() => void update()}>
          {t('pwa.update')}
        </button>
      )}
      <button type="button" onClick={close}>
        {t('pwa.dismiss')}
      </button>
    </div>
  );
}
