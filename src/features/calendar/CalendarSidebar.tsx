import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import todaySheet from '../../../brand/calendar/hoja-hoy.svg?raw';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { normalizeForSearch } from '../../application/searchIndex.ts';
import { localDate } from '../../domain/calendar.ts';
import { internalLink, parseInternalLink } from '../../domain/links.ts';
import { RenameableTitle } from '../library/RenameableTitle.tsx';
import { useCalendarStore } from './calendarStore.ts';

interface Props {
  onCreateCalendar: (title: string) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onTrash: (documentId: string) => Promise<void>;
}

/**
 * Sección «Calendario» de la biblioteca: «Nuevo evento» (el botón principal de la sección) y
 * «Mis calendarios», con una casilla por calendario para mostrarlo u ocultarlo en la vista.
 */
export function CalendarSidebar({ onCreateCalendar, onRename, onTrash }: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const { calendars, hidden, toggleHidden, openDraft } = useCalendarStore();
  const [newName, setNewName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);
  const list = documents
    .filter((d) => d.kind === 'calendar' && !d.deleted)
    .sort((a, b) => a.title.localeCompare(b.title));
  const [query, setQuery] = useState('');
  /** Buscar eventos por título en todos los calendarios (plan 9.12); el más próximo primero. */
  const found = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return [];
    return Object.values(calendars)
      .flatMap((c) =>
        c.data.events
          .filter((e) => normalizeForSearch(e.title).includes(q))
          .map((event) => ({ event, calendarId: c.document.id })),
      )
      .sort((a, b) => b.event.date.localeCompare(a.event.date))
      .slice(0, 30);
  }, [calendars, query]);
  const navigate = useUiStore((s) => s.navigate);

  return (
    <div className="calendar-sidebar">
      <button
        type="button"
        className="primary new-event"
        data-testid="new-event"
        disabled={list.length === 0}
        onClick={() =>
          openDraft({ mode: 'new', date: localDate(new Date()), start: null, calendarId: null })
        }
      >
        <Icon name="mas" size={18} />
        {t('calendar.newEvent')}
      </button>

      <TodaySheet />

      <input
        type="search"
        className="calendar-search"
        value={query}
        placeholder={t('calendar.searchEvents')}
        aria-label={t('calendar.searchEvents')}
        data-testid="calendar-search"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
      />
      {query.trim() && (
        <ul className="library-list calendar-search-results" data-testid="calendar-search-results">
          {found.length === 0 && <li className="muted small">{t('calendar.searchNoResults')}</li>}
          {found.map(({ event, calendarId }) => (
            <li key={`${calendarId}-${event.id}`}>
              <button
                type="button"
                className={`calendar-search-hit event-${event.color}`}
                data-testid="calendar-search-hit"
                onClick={() => {
                  const target = parseInternalLink(internalLink(calendarId, { eventId: event.id }));
                  if (target) navigate(linkFocus(target));
                }}
              >
                <span className="calendar-search-swatch" aria-hidden="true" />
                <span className="calendar-search-title">
                  {event.title || t('calendar.untitled')}
                </span>
                <span className="muted small">{event.date}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="calendar-list-head">
        <h3 className="section-title">{t('calendar.myCalendars')}</h3>
        <button
          type="button"
          className="icon-button"
          aria-label={t('calendar.newCalendar')}
          title={t('calendar.newCalendar')}
          data-testid="new-calendar"
          onClick={() => setNewName('')}
        >
          <Icon name="mas" size={16} />
        </button>
      </div>

      {newName !== null && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const title = newName.trim();
            setNewName(null);
            if (title) void onCreateCalendar(title);
          }}
        >
          <input
            autoFocus
            value={newName}
            placeholder={t('calendar.calendarName')}
            aria-label={t('calendar.calendarName')}
            data-testid="new-calendar-input"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNewName(null)}
          />
          <button type="submit" className="icon-button" aria-label={t('calendar.newCalendar')}>
            <Icon name="check" size={18} />
          </button>
        </form>
      )}

      <ul className="library-list calendar-list" data-testid="calendar-list">
        {list.map((doc) => {
          const color = calendars[doc.id]?.data.color ?? 'mantequilla';
          const shown = !hidden.includes(doc.id);
          return (
            <li key={doc.id} data-testid="calendar-item" data-document-id={doc.id}>
              <label className={`calendar-check event-${color}`}>
                <input
                  type="checkbox"
                  checked={shown}
                  aria-label={t('calendar.show', { name: doc.title })}
                  onChange={() => toggleHidden(doc.id)}
                />
                <span className="calendar-check-box" aria-hidden="true">
                  {shown && <Icon name="check" size={14} />}
                </span>
              </label>
              <RenameableTitle
                title={doc.title}
                testId="calendar-title"
                showRenameButton={false}
                editRequest={renaming?.id === doc.id ? renaming.seq : 0}
                onRename={(title) => onRename(doc.id, title)}
              />
              <Menu
                className="row-menu"
                trigger={<Icon name="mas-opciones" size={18} />}
                label={`${t('library.actions')}: ${doc.title}`}
                triggerClassName="icon-button"
                testId="calendar-actions"
                placement="bottom-end"
                items={[
                  {
                    id: 'calendar-rename',
                    label: t('library.rename'),
                    icon: 'editar',
                    onSelect: () => setRenaming((r) => ({ id: doc.id, seq: (r?.seq ?? 0) + 1 })),
                  },
                  {
                    id: 'calendar-trash',
                    label: t('library.trash'),
                    icon: 'eliminar',
                    danger: true,
                    // El último calendario no se borra: la sección necesita uno para crear eventos.
                    disabled: list.length === 1,
                    onSelect: () => void onTrash(doc.id),
                  },
                ]}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const escapeXml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Hoja de «hoy» (DESIGN.md §8.5): el taco ilustrado de `brand/calendar/hoja-hoy.svg` con el día
 * de hoy. Es un objeto ilustrado, como los de la barra: no cambia en oscuro.
 */
function TodaySheet() {
  const { i18n, t } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'es';
  const today = new Date();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(today);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(today);
  const svg = todaySheet
    .replace('>MARTES<', `>${escapeXml(weekday.toLocaleUpperCase(locale))}<`)
    .replace('>13<', `>${today.getDate()}<`)
    .replace('>octubre<', `>${escapeXml(month)}<`);
  const label = t('calendar.todaySheet', {
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(today),
  });
  return (
    <div
      className="today-sheet"
      role="img"
      aria-label={label}
      data-testid="today-sheet"
      // SVG propio del repositorio (brand/), sin scripts; solo cambian tres textos escapados.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
