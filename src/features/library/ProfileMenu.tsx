import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
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
          id: 'settings-storage',
          label: t('settings.menu.storage'),
          icon: 'nube',
          onSelect: () => onOpenSettings('storage'),
        },
        {
          id: 'settings-appearance',
          label: t('settings.menu.themes'),
          icon: 'tema-sistema',
          onSelect: () => onOpenSettings('appearance'),
        },
        {
          id: 'settings-language',
          label: t('settings.menu.language'),
          icon: 'idioma',
          hint: i18n.language.startsWith('en') ? 'EN' : 'ES',
          onSelect: () => onOpenSettings('language'),
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
