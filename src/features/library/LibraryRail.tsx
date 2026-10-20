import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { Icon, type IconName } from '../../app/ui/Icon.tsx';
import { Menu, type MenuItem } from '../../app/ui/Menu.tsx';
import { localDate } from '../../domain/calendar.ts';
import type { DocumentKind } from '../../domain/revision.ts';
import { useCalendarStore } from '../calendar/calendarStore.ts';
import type { SettingsSection } from '../status/SettingsDialog.tsx';
import type { DocEditorKind } from './LibrarySidebar.tsx';
import { ProfileMenu } from './ProfileMenu.tsx';

const SECTIONS = [
  ['library', 'biblioteca', 'library.sectionNotes'],
  ['documents', 'documento', 'docs.title'],
  ['calendar', 'calendario', 'calendar.title'],
] as const satisfies ReadonlyArray<readonly [string, IconName, string]>;

/**
 * Barra lateral plegada en «solo iconos» (plan 9.19): desplegar, las tres secciones, «Nuevo»
 * (lo de la sección), «Buscar» (despliega la barra con el buscador enfocado) y Perfil abajo.
 * Cada botón lleva su nombre como etiqueta y aviso. En pantallas estrechas no se muestra: allí
 * la barra sigue siendo el panel superpuesto.
 */
export function LibraryRail({
  onCreate,
  onCreateDoc,
  onOpenSettings,
}: {
  onCreate: (kind: DocumentKind) => Promise<void>;
  onCreateDoc: (editor: DocEditorKind) => Promise<void>;
  onOpenSettings: (section: SettingsSection) => void;
}) {
  const { t } = useTranslation();
  const section = useUiStore((s) => s.section);
  const setSection = useUiStore((s) => s.setSection);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);

  const search = () => {
    toggleLibrary();
    // El buscador aparece con la barra desplegada (dos fotogramas: montaje y maquetación).
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>(
            '[data-testid="library-search"], [data-testid="calendar-search"]',
          )
          ?.focus(),
      ),
    );
  };

  const newItems: MenuItem[] =
    section === 'documents'
      ? [
          {
            id: 'rail-new-doc-rich',
            label: t('docs.kindRich'),
            icon: 'documento',
            onSelect: () => void onCreateDoc('tiptap'),
          },
          {
            id: 'rail-new-doc-markdown',
            label: t('docs.kindMarkdown'),
            icon: 'documento-md',
            onSelect: () => void onCreateDoc('milkdown'),
          },
        ]
      : section === 'calendar'
        ? [
            {
              id: 'rail-new-event',
              label: t('calendar.newEvent'),
              icon: 'evento-mas',
              onSelect: () =>
                useCalendarStore.getState().openDraft({
                  mode: 'new',
                  date: localDate(new Date()),
                  start: null,
                  calendarId: null,
                }),
            },
          ]
        : [
            {
              id: 'rail-new-canvas',
              label: t('library.kindCanvas'),
              icon: 'lienzo',
              onSelect: () => void onCreate('canvas'),
            },
            {
              id: 'rail-new-note',
              label: t('library.kindNote'),
              icon: 'nota',
              onSelect: () => void onCreate('note'),
            },
          ];

  return (
    <nav className="library-rail" aria-label={t('library.title')} data-testid="library-rail">
      <button
        type="button"
        className="icon-button rail-button"
        aria-label={t('app.toggleLibrary')}
        title={t('app.toggleLibrary')}
        aria-expanded={false}
        data-testid="rail-expand"
        onClick={toggleLibrary}
      >
        <Icon name="panel-lateral" size={20} />
      </button>
      <div className="rail-group" role="tablist" aria-label={t('library.sections')}>
        {SECTIONS.map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            aria-label={t(label)}
            title={t(label)}
            className={`icon-button rail-button${section === key ? ' is-active' : ''}`}
            data-testid={`rail-section-${key}`}
            onClick={() => setSection(key)}
          >
            <Icon name={icon} size={20} on={section === key} />
          </button>
        ))}
      </div>
      <div className="rail-group">
        <Menu
          trigger={<Icon name="mas" size={20} />}
          label={t('library.new')}
          triggerClassName="icon-button rail-button rail-new"
          testId="rail-new"
          placement="bottom-start"
          items={newItems}
        />
        <button
          type="button"
          className="icon-button rail-button"
          aria-label={t('rail.search')}
          title={t('rail.search')}
          data-testid="rail-search"
          onClick={search}
        >
          <Icon name="buscar" size={20} />
        </button>
      </div>
      <span className="rail-spacer" />
      <ProfileMenu onOpenSettings={onOpenSettings} compact />
    </nav>
  );
}
