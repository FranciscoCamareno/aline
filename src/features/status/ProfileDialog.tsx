import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppServices } from '../../app/services.ts';
import type { SyncRuntime } from '../../app/syncRuntime.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { StorageSection } from './StorageSection.tsx';

interface Props {
  services: AppServices;
  sync: SyncRuntime | null;
  onClose: () => void;
  onError: (error: unknown) => void;
}

/**
 * Perfil: dónde se guarda el almacén y la conexión con Google Drive (o con una carpeta), con sus
 * avisos y la elección de cifrado. El estado y el diagnóstico siguen en el menú «⋯» de la
 * cabecera. Un modal: es una decisión con consecuencias (RN-12), así que se atiende aquí y no se
 * cierra por un clic accidental fuera, que perdería la contraseña a medio escribir.
 */
export function ProfileDialog({ services, sync, onClose, onError }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  // El foco entra en el diálogo; al cerrarlo vuelve a quien lo abrió.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dialog profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        data-testid="profile-dialog"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <header className="dialog-head">
          <Icon name="usuario" size={20} />
          <h2 id="profile-title">{t('profile.title')}</h2>
          <span className="topbar-spacer" />
          <button
            type="button"
            className="icon-button"
            aria-label={t('statusPanel.close')}
            data-testid="profile-close"
            onClick={onClose}
          >
            <Icon name="cerrar" size={18} />
          </button>
        </header>
        <p className="muted">{t('profile.lead')}</p>
        <StorageSection services={services} sync={sync} onError={onError} />
        {(services.temporary || !sync) && <p className="notice">{t('profile.unavailable')}</p>}
      </div>
    </div>
  );
}
