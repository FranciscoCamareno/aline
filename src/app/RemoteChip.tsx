import { useTranslation } from 'react-i18next';
import { useUiStore } from './store.ts';

/**
 * Estado del destino conectado (diseño §4.1), separado del estado de guardado local: un guardado
 * en el navegador nunca se muestra como escrito en la carpeta ni como «Sincronizado».
 */
export function RemoteChip({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const remote = useUiStore((s) => s.remote);
  if (!remote) return null;
  return (
    <button
      type="button"
      className={`remote-chip remote-${remote.phase}`}
      data-testid="remote-status"
      title={t('storage.title')}
      onClick={onOpen}
    >
      📁 {t(`storage.chip.${remote.phase}`, { count: remote.pending })}
    </button>
  );
}
