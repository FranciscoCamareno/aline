import { useEffect, useRef, type ReactNode } from 'react';
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
import { setWeekStart, useWeekStart } from '../calendar/calendarPrefs.ts';
import { setSidebarCollapse, useSidebarCollapse } from '../../app/sidebarPref.ts';
import {
  CURSOR_PREVIEW,
  setCursorPreference,
  useCursorPreference,
  type CursorPreference,
} from '../../app/cursors.ts';
import { Icon, KindIcon, type IconName } from '../../app/ui/Icon.tsx';
import { isFolderKind } from '../../domain/revision.ts';
import { setDocLayout, useDocLayout, type DocLayoutKind } from '../docs/layout.tsx';
import { StorageSection } from './StorageSection.tsx';

/** Secciones de la configuración, en el orden de la navegación lateral. */
export const SETTINGS_SECTIONS = ['storage', 'preferences', 'archive', 'trash'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_ICONS: Record<SettingsSection, IconName> = {
  storage: 'nube',
  preferences: 'ajustes',
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
 * la cabecera): navegación lateral con almacenamiento, preferencias e idioma, archivo y papelera.
 * Un modal:
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
            {/* Preferencias e idioma (plan 10.2): lo que antes eran Apariencia e Idioma. */}
            {section === 'preferences' && (
              <>
                <PreferenceGroup id="appearance">
                  <AppearanceSettings />
                  <CursorSettings />
                  <SidebarCollapseSettings />
                </PreferenceGroup>
                <PreferenceGroup id="region">
                  <LanguageSettings />
                  <WeekStartSettings />
                </PreferenceGroup>
                <PreferenceGroup id="documents">
                  <DocLayoutSettings kind="doc" />
                  <DocLayoutSettings kind="mddoc" />
                </PreferenceGroup>
              </>
            )}
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

/** Grupo de Preferencias e idioma con su título (plan 10.2). */
function PreferenceGroup({
  id,
  children,
}: {
  id: 'appearance' | 'region' | 'documents';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="preference-group"
      aria-labelledby={`preferences-${id}-title`}
      data-testid={`preferences-${id}`}
    >
      <h4 id={`preferences-${id}-title`} className="preference-group-title">
        {t(`settings.groups.${id}`)}
      </h4>
      {children}
    </section>
  );
}

/**
 * Punteros de «aline» o del sistema (plan 9.18): quien use un puntero grande del sistema lo
 * conserva. Cada opción muestra los básicos en una vista previa estática (plan 10.4); los del
 * sistema son dibujos orientativos.
 */
function CursorSettings() {
  const { t } = useTranslation();
  const preference = useCursorPreference();
  return (
    <section className="scheme-group" aria-labelledby="cursor-preference-title">
      <h4 id="cursor-preference-title" className="section-title">
        {t('preferences.cursors')}
      </h4>
      <p className="muted small">{t('preferences.cursorsHint')}</p>
      <div className="scheme-grid" role="radiogroup" aria-labelledby="cursor-preference-title">
        {(['aline', 'system'] as const satisfies readonly CursorPreference[]).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={preference === value}
            className={`scheme-card${preference === value ? ' is-selected' : ''}`}
            data-testid={`cursor-preference-${value}`}
            onClick={() => setCursorPreference(value)}
          >
            <span className="cursor-preview" aria-hidden="true">
              {CURSOR_PREVIEW.map((cursor) => (
                <img
                  key={cursor.name}
                  src={cursor[value]}
                  alt=""
                  width={32}
                  height={32}
                  draggable={false}
                />
              ))}
            </span>
            <span className="scheme-name">
              {t(value === 'aline' ? 'preferences.cursorsAline' : 'preferences.cursorsSystem')}
              {preference === value && <Icon name="check" size={16} />}
            </span>
            <span className="scheme-note">
              {t(
                value === 'aline'
                  ? 'preferences.cursorsAlineNote'
                  : 'preferences.cursorsSystemNote',
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Presentación de los documentos (plan 10.3): ya no se cambia desde el documento. Por defecto, los
 * documentos con formato en hoja y los Markdown en continuo.
 */
function DocLayoutSettings({ kind }: { kind: DocLayoutKind }) {
  const { t } = useTranslation();
  const layout = useDocLayout(kind);
  const label = t(kind === 'doc' ? 'preferences.docLayoutRich' : 'preferences.docLayoutMarkdown');
  return (
    <label className="preference-row">
      <KindIcon kind={kind} />
      <span>
        {label}
        <small className="muted">{t('preferences.docLayoutHint')}</small>
      </span>
      <select
        name={`doc-layout-${kind}`}
        aria-label={label}
        value={layout}
        data-testid={`doc-layout-${kind}`}
        onChange={(e) => setDocLayout(kind, e.target.value === 'page' ? 'page' : 'continuous')}
      >
        <option value="page">{t('docs.layout_page')}</option>
        <option value="continuous">{t('docs.layout_continuous')}</option>
      </select>
    </label>
  );
}

/**
 * «Al plegar la barra lateral» (plan 9.19): ocultarla o dejar solo los iconos. Las vistas previas
 * se dibujan con los tokens (no son imágenes): una ventana con o sin columna de iconos.
 */
function SidebarCollapseSettings() {
  const { t } = useTranslation();
  const mode = useSidebarCollapse();
  return (
    <section className="scheme-group" aria-labelledby="sidebar-collapse-title">
      <h4 id="sidebar-collapse-title" className="section-title">
        {t('preferences.sidebarCollapse')}
      </h4>
      <div className="scheme-grid" role="radiogroup" aria-labelledby="sidebar-collapse-title">
        {(['hide', 'rail'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className={`scheme-card${mode === value ? ' is-selected' : ''}`}
            data-testid={`sidebar-collapse-${value}`}
            onClick={() => setSidebarCollapse(value)}
          >
            <span className={`collapse-preview collapse-preview--${value}`} aria-hidden="true">
              <span className="collapse-preview-rail">
                <i />
                <i />
                <i />
              </span>
              <span className="collapse-preview-top" />
              <span className="collapse-preview-body">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="scheme-name">
              {t(value === 'hide' ? 'preferences.sidebarHide' : 'preferences.sidebarRail')}
              {mode === value && <Icon name="check" size={16} />}
            </span>
            <span className="scheme-note">
              {t(value === 'hide' ? 'preferences.sidebarHideNote' : 'preferences.sidebarRailNote')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** «Seguir al sistema» y los esquemas de color (DESIGN.md §2.5): uno claro y uno oscuro. */
export function AppearanceSettings() {
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
          name="theme-system"
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

export function LanguageSettings() {
  const { t, i18n } = useTranslation();
  return (
    <label className="preference-row">
      <Icon name="idioma" size={18} />
      <span>
        {t('app.language')}
        <small className="muted">{t('settings.languageHint')}</small>
      </span>
      <select
        name="language"
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

/** Día en que empieza la semana en el calendario (DESIGN.md §8.1; plan 9.12). */
function WeekStartSettings() {
  const { t } = useTranslation();
  const weekStart = useWeekStart();
  return (
    <label className="preference-row">
      <Icon name="calendario" size={18} />
      <span>{t('calendar.weekStart')}</span>
      <select
        name="week-start"
        aria-label={t('calendar.weekStart')}
        value={weekStart}
        data-testid="week-start"
        onChange={(e) => setWeekStart(e.target.value === '0' ? 0 : 1)}
      >
        <option value={1}>{t('calendar.weekStartMonday')}</option>
        <option value={0}>{t('calendar.weekStartSunday')}</option>
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
