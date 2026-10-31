import { useTranslation } from 'react-i18next';
import { usePomodoro } from '../../app/pomodoro.ts';
import { useUiStore } from '../../app/store.ts';
import { derive, formatClock } from '../../domain/pomodoro.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import type { SettingsSection } from '../status/SettingsDialog.tsx';

/**
 * Perfil (pie de la barra lateral): menú hacia arriba con las secciones de Configuración. Lo usan
 * la barra lateral y su versión de solo iconos (`compact`, plan 9.19).
 */
export function ProfileMenu({
  onOpenSettings,
  compact = false,
}: {
  onOpenSettings: (section: SettingsSection) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const trashed = documents.filter((d) => d.deleted).length;
  const archived = documents.filter((d) => !d.deleted && d.archived).length;
  const pomodoro = usePomodoro((s) => s.session);
  const now = usePomodoro((s) => s.now);
  return (
    <Menu
      className="profile-menu"
      trigger={
        compact ? (
          <Icon name="usuario" size={20} />
        ) : (
          <>
            <Icon name="usuario" size={18} />
            <span className="profile-menu-label">{t('profile.title')}</span>
            <Icon name="chevron-arriba" size={16} />
          </>
        )
      }
      label={t('profile.title')}
      triggerClassName={compact ? 'icon-button rail-button' : 'foot-button profile-trigger'}
      testId="open-profile"
      placement="top-start"
      items={[
        {
          // Con un pomodoro en marcha, abre la muesca de la cabecera en vez del modal (plan 14.4).
          id: 'open-pomodoro',
          label: t('pomodoro.menu'),
          icon: 'reloj',
          ...(pomodoro ? { hint: formatClock(derive(pomodoro, now).remainingMs) } : {}),
          onSelect: () =>
            pomodoro
              ? usePomodoro.getState().setNotchOpen(true)
              : usePomodoro.getState().openDialog(),
        },
        {
          id: 'settings-storage',
          label: t('settings.menu.storage'),
          icon: 'nube',
          separated: true,
          onSelect: () => onOpenSettings('storage'),
        },
        {
          id: 'settings-preferences',
          label: t('settings.menu.preferences'),
          icon: 'ajustes',
          hint: i18n.language.startsWith('en') ? 'EN' : 'ES',
          onSelect: () => onOpenSettings('preferences'),
        },
        {
          id: 'settings-archive',
          label: t('settings.menu.archive'),
          icon: 'archivar',
          hint: String(archived),
          onSelect: () => onOpenSettings('archive'),
        },
        {
          id: 'settings-trash',
          label: t('settings.menu.trash'),
          icon: 'eliminar',
          hint: String(trashed),
          onSelect: () => onOpenSettings('trash'),
        },
      ]}
    />
  );
}
