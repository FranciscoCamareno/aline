import { useTranslation } from 'react-i18next';
import { useUiStore } from './store.ts';

/**
 * Estado del destino conectado (diseño §4.1), separado del estado de guardado local: un guardado
 * en el navegador nunca se muestra como escrito en la carpeta ni como «Sincronizado». Para Drive,
 * «Sincronizado · hh:mm» solo aparece tras un ciclo completo sin nada pendiente.
 */
export function RemoteChip({ onOpen }: { onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const remote = useUiStore((s) => s.remote);
  if (!remote) return null;
  const drive = remote.kind === 'drive';
  const time = remote.lastSyncAt
    ? new Date(remote.lastSyncAt).toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  return (
    <button
      type="button"
      className={`remote-chip remote-${remote.phase}`}
      data-testid="remote-status"
      title={t('storage.title')}
      onClick={onOpen}
    >
      {drive ? '☁️' : '📁'}{' '}
      {t(`storage.${drive ? 'driveChip' : 'chip'}.${remote.phase}`, {
        count: remote.pending,
        time,
      })}
    </button>
  );
}
