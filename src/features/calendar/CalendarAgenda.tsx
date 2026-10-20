import { useTranslation } from 'react-i18next';
import todaySheet from '../../../brand/calendar/hoja-hoy.svg?raw';
import {
  addDays,
  expandEvents,
  localDate,
  minutesOf,
  type CalendarEvent,
  type IsoDate,
} from '../../domain/calendar.ts';
import type { ShownEvent } from './CalendarView.tsx';

/** Días que muestra «Próximos». */
const UPCOMING_DAYS = 7;

const escapeXml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Hoja de «hoy» (DESIGN.md §8.5): el taco ilustrado de `brand/calendar/hoja-hoy.svg` con el día
 * de hoy. Es un objeto ilustrado, como los de la barra: no cambia en oscuro.
 */
export function TodaySheet({ now }: { now: Date }) {
  const { i18n, t } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'es';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const svg = todaySheet
    .replace('>MARTES<', `>${escapeXml(weekday.toLocaleUpperCase(locale))}<`)
    .replace('>13<', `>${now.getDate()}<`)
    .replace('>octubre<', `>${escapeXml(month)}<`);
  const label = t('calendar.todaySheet', {
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(now),
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

/**
 * Panel derecho del calendario (plan 9.12, revisado el 20/10/2026): la hoja de «hoy» y los
 * eventos de los próximos 7 días agrupados por día, como una agenda. Hoy solo lista lo que aún
 * no ha terminado. Pulsar un evento lo abre.
 */
export function CalendarAgenda({
  events,
  calendarNames,
  now,
  onOpen,
}: {
  /** Eventos de los calendarios visibles, sin desplegar (se despliegan aquí). */
  events: ReadonlyArray<CalendarEvent & { calendarId: string }>;
  calendarNames: Record<string, string>;
  now: Date;
  onOpen: (event: ShownEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'es';
  const today = localDate(now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const shown = expandEvents(events, today, addDays(today, UPCOMING_DAYS - 1)) as ShownEvent[];
  const dayLabel = (date: IsoDate, index: number) => {
    const short = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
    }).format(new Date(`${date}T12:00:00`));
    if (index === 0) return t('calendar.agendaToday', { date: short });
    if (index === 1) return t('calendar.agendaTomorrow', { date: short });
    return short.charAt(0).toLocaleUpperCase() + short.slice(1);
  };
  const days = Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(today, i)).map(
    (date, index) => ({
      date,
      index,
      items: shown.filter(
        (e) =>
          e.date <= date &&
          e.endDate >= date &&
          // Hoy, lo que ya terminó no está «próximo».
          !(index === 0 && e.end && e.endDate === today && minutesOf(e.end) <= minutesNow),
      ),
    }),
  );
  const total = days.reduce((n, d) => n + d.items.length, 0);
  return (
    <aside className="calendar-panel" aria-label={t('calendar.panel')} data-testid="calendar-panel">
      <TodaySheet now={now} />
      <div className="agenda-head">
        <h2 className="section-title">{t('calendar.upcoming')}</h2>
        <span className="muted small">{t('calendar.nextDays', { count: UPCOMING_DAYS })}</span>
      </div>
      {total === 0 && <p className="muted small">{t('calendar.noUpcoming')}</p>}
      {total > 0 &&
        days.map(({ date, index, items }) =>
          items.length === 0 && index > 0 ? null : (
            <section key={date} className="agenda-day" data-testid="agenda-day" data-date={date}>
              <h3 className="agenda-day-title">{dayLabel(date, index)}</h3>
              {items.length === 0 && <p className="muted small">{t('calendar.noMoreToday')}</p>}
              <ul className="agenda-list">
                {items.map((event) => (
                  <li key={`${event.calendarId}-${event.id}-${event.occurrence ?? ''}`}>
                    <button
                      type="button"
                      className={`agenda-item event-${event.color}`}
                      data-testid="agenda-item"
                      onClick={() => onOpen(event)}
                    >
                      <span className="agenda-dot" aria-hidden="true" />
                      <span className="agenda-text">
                        <span className="agenda-title">
                          {event.title || t('calendar.untitled')}
                        </span>
                        <span className="agenda-meta">
                          {event.start && event.end
                            ? `${event.date === date ? event.start : '00:00'} – ${
                                event.endDate === date ? event.end : '24:00'
                              }`
                            : t('calendar.allDay')}
                          {' · '}
                          {calendarNames[event.calendarId] ?? ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
    </aside>
  );
}
