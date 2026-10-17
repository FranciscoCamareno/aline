import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type AppLanguage } from '../../app/i18n.ts';
import {
  DARK_SCHEMES,
  LIGHT_SCHEMES,
  SCHEME_PAIR,
  schemePreview,
  type Scheme,
} from '../../app/schemes.ts';
import type { AppServices } from '../../app/services.ts';
import { useUiStore } from '../../app/store.ts';
import type { SyncRuntime } from '../../app/syncRuntime.ts';
import { setScheme, setThemePreference, useTheme } from '../../app/theme.ts';
import { Icon, KindIcon, type IconName } from '../../app/ui/Icon.tsx';
import { isFolderKind } from '../../domain/revision.ts';
import { StorageSection } from './StorageSection.tsx';

/** Secciones de la configuración, en el orden de la navegación lateral. */
export const SETTINGS_SECTIONS = ['storage', 'appearance', 'language', 'archive', 'trash'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_ICONS: Record<SettingsSection, IconName> = {
  storage: 'nube',
  appearance: 'tema-sistema',
  language: 'idioma',
  archive: 'archivar',
  trash: 'eliminar',
};

interface Props {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  services: AppServices;
  sync: SyncRuntime | null;
  onRestoreFromTrash: (documentId: string) => Promise<void>;
  onPurge: (documentId: string) => Promise<void>;
  onUnarchive: (documentId: string) => Promise<void>;
  onClose: () => void;
  onError: (error: unknown) => void;
}

/**
 * Configuración (se abre desde el menú de Perfil de la barra lateral y desde el estado remoto de
 * la cabecera): navegación lateral con almacenamiento, apariencia, idioma y papelera. Un modal:
 * almacenamiento incluye decisiones con consecuencias (RN-12, cifrado), así que no se cierra por
 * un clic accidental fuera, que perdería una contraseña a medio escribir.
 */
export function SettingsDialog({
  section,
  onSection,
  services,
  sync,
  onRestoreFromTrash,
  onPurge,
  onUnarchive,
  onClose,
  onError,
}: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  // El foco entra en el diálogo; al cerrarlo vuelve a quien lo abrió.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('.settings-nav [aria-current="page"]')?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-dialog"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <nav className="settings-nav" aria-label={t('settings.title')}>
          <h2 id="settings-title" className="settings-nav-title">
            {t('settings.title')}
          </h2>
          {SETTINGS_SECTIONS.map((key) => (
            <button
              key={key}
              type="button"
              className={`settings-nav-item${section === key ? ' is-active' : ''}`}
              aria-current={section === key ? 'page' : undefined}
              data-testid={`settings-tab-${key}`}
              onClick={() => onSection(key)}
            >
              <Icon name={SECTION_ICONS[key]} size={18} on={section === key} />
              {t(`settings.sections.${key}`)}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <header className="settings-head">
            <h3>{t(`settings.sections.${section}`)}</h3>
            <span className="topbar-spacer" />
            <button
              type="button"
              className="icon-button"
              aria-label={t('statusPanel.close')}
              title={t('statusPanel.close')}
              data-testid="settings-close"
              onClick={onClose}
            >
              <Icon name="cerrar" size={18} />
            </button>
          </header>
          <div className="settings-body" data-testid={`settings-section-${section}`}>
            {section === 'storage' && (
              <>
                <p className="muted">{t('profile.lead')}</p>
                <StorageSection services={services} sync={sync} onError={onError} />
                {(services.temporary || !sync) && (
                  <p className="notice">{t('profile.unavailable')}</p>
                )}
              </>
            )}
            {section === 'appearance' && <AppearanceSettings />}
            {section === 'language' && <LanguageSettings />}
            {section === 'archive' && (
              <ArchiveSettings onUnarchive={onUnarchive} onOpen={onClose} />
            )}
            {section === 'trash' && (
              <TrashSettings onRestore={onRestoreFromTrash} onPurge={onPurge} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** «Seguir al sistema» y los esquemas de color (DESIGN.md §2.5): uno claro y uno oscuro. */
function AppearanceSettings() {
  const { t } = useTranslation();
  const { theme, preference, lightScheme, darkScheme } = useTheme();

  const group = (mode: 'light' | 'dark', schemes: readonly Scheme[], selected: Scheme) => (
    <section className="scheme-group" aria-labelledby={`scheme-${mode}-title`}>
      <h4 id={`scheme-${mode}-title`} className="section-title">
        {t(mode === 'light' ? 'preferences.lightSchemes' : 'preferences.darkSchemes')}
      </h4>
      <div className="scheme-grid" role="radiogroup" aria-labelledby={`scheme-${mode}-title`}>
        {schemes.map((scheme) => (
          <button
            key={scheme}
            type="button"
            role="radio"
            aria-checked={selected === scheme}
            className={`scheme-card${selected === scheme ? ' is-selected' : ''}`}
            data-testid={`scheme-${scheme}`}
            onClick={() => setScheme(scheme)}
          >
            <img src={schemePreview(scheme)} alt="" width={300} height={188} loading="lazy" />
            <span className="scheme-name">
              {t(`schemes.${scheme}.name`)}
              {selected === scheme && <Icon name="check" size={16} />}
            </span>
            <span className="scheme-note">
              {t(`schemes.${scheme}.note`)} ·{' '}
              {t('preferences.pair', { scheme: t(`schemes.${SCHEME_PAIR[scheme]}.name`) })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <>
      {/* «Seguir al sistema» vive aquí; el interruptor de la cabecera pasa a modo manual. */}
      <label className="preference-row">
        <Icon name="tema-sistema" size={18} />
        <span>
          {t('preferences.followSystem')}
          <small className="muted">{t('preferences.followSystemHint')}</small>
        </span>
        <input
          type="checkbox"
          checked={preference === 'system'}
          data-testid="theme-system"
          onChange={(e) => setThemePreference(e.target.checked ? 'system' : theme)}
        />
      </label>
      {group('light', LIGHT_SCHEMES, lightScheme)}
      {group('dark', DARK_SCHEMES, darkScheme)}
    </>
  );
}

function LanguageSettings() {
  const { t, i18n } = useTranslation();
  return (
    <label className="preference-row">
      <Icon name="idioma" size={18} />
      <span>
        {t('app.language')}
        <small className="muted">{t('settings.languageHint')}</small>
      </span>
      <select
        aria-label={t('app.language')}
        value={i18n.language.startsWith('en') ? 'en' : 'es'}
        onChange={(e) => setLanguage(e.target.value as AppLanguage)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(`settings.languages.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Papelera (RN-03): restaurar o borrar definitivamente, con confirmación. */
/**
 * Archivo (desde el 17/10/2026): lo archivado no está en la barra lateral, pero sigue en la
 * búsqueda y sus enlaces funcionan. Desde aquí se abre o se devuelve a la barra.
 */
function ArchiveSettings({
  onUnarchive,
  onOpen,
}: {
  onUnarchive: (documentId: string) => Promise<void>;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const archived = useUiStore((s) => s.documents).filter((d) => d.archived && !d.deleted);
  const navigate = useUiStore((s) => s.navigate);
  return (
    <>
      <p className="muted">{t('settings.archiveLead')}</p>
      <ul className="library-list trash-list" data-testid="archive-list">
        {archived.length === 0 && <li className="muted">{t('settings.archiveEmpty')}</li>}
        {archived.map((doc) => (
          <li key={doc.id} data-testid="archive-item" data-document-id={doc.id}>
            <KindIcon kind={doc.kind} />
            {isFolderKind(doc.kind) ? (
              <span className="renameable-text">{doc.title}</span>
            ) : (
              <button
                type="button"
                className="renameable-text link-button"
                data-testid="archive-open"
                onClick={() => {
                  navigate({ documentId: doc.id });
                  onOpen();
                }}
              >
                {doc.title}
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label={`${t('settings.unarchive')}: ${doc.title}`}
              title={t('settings.unarchive')}
              data-testid="archive-restore"
              onClick={() => void onUnarchive(doc.id)}
            >
              <Icon name="restaurar" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function TrashSettings({
  onRestore,
  onPurge,
}: {
  onRestore: (documentId: string) => Promise<void>;
  onPurge: (documentId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const trashed = useUiStore((s) => s.documents).filter((d) => d.deleted);
  return (
    <>
      <p className="muted">{t('settings.trashLead')}</p>
      <ul className="library-list trash-list" data-testid="trash-list">
        {trashed.length === 0 && <li className="muted">{t('library.trashEmpty')}</li>}
        {trashed.map((doc) => (
          <li key={doc.id} data-testid="trash-item" data-document-id={doc.id}>
            <KindIcon kind={doc.kind} />
            <span className="renameable-text">{doc.title}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={`${t('library.restore')}: ${doc.title}`}
              title={t('library.restore')}
              data-testid="trash-restore"
              onClick={() => void onRestore(doc.id)}
            >
              <Icon name="restaurar" size={18} />
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`${t('library.purge')}: ${doc.title}`}
              title={t('library.purge')}
              data-testid="trash-purge"
              onClick={() => {
                if (window.confirm(t('library.purgeConfirm', { title: doc.title }))) {
                  void onPurge(doc.id);
                }
              }}
            >
              <Icon name="eliminar" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
