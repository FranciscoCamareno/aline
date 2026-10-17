import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import type { VaultService } from '../../application/VaultService.ts';
import {
  addDays,
  addMonths,
  firstOfMonth,
  localDate,
  monthGrid,
  monthOf,
  startOfWeek,
  weekdayIndex,
  type CalendarEvent,
  type IsoDate,
} from '../../domain/calendar.ts';
import { hasConflict } from '../../domain/revision.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import { ConflictPanel } from '../history/ConflictPanel.tsx';
import { useCalendarStore } from './calendarStore.ts';
import { EventDialog } from './EventDialog.tsx';
import { layoutDay, layoutWeek } from './layout.ts';

/** Evento con el calendario al que pertenece. */
export interface ShownEvent extends CalendarEvent {
  calendarId: string;
}

type View = 'day' | 'week' | 'month';
/** Alto de una hora en la vista de semana. */
const HOUR = 56;

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const asDate = (date: IsoDate) => new Date(`${date}T12:00:00`);

/** Marca de «tiene enlaces» en un evento de la vista; el número se anuncia y aparece al pasar. */
function LinkMark({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  const label = t('calendar.hasLinks', { count });
  return (
    <span className="event-link-mark" title={label} data-testid="event-link-mark">
      <Icon name="enlace" size={12} />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

/** El primer calendario se crea solo, la primera vez que se abre la sección. */
let creatingDefault: Promise<void> | null = null;

/**
 * Calendario (DESIGN.md §8): vista de mes y de semana sobre los documentos `calendar` del
 * almacén. La vista de día y el selector de fechas propio quedan para más adelante.
 */
export function CalendarView({ service }: { service: VaultService }) {
  const { t, i18n } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const libraryOpen = useUiStore((s) => s.libraryOpen);
  const { calendars, hidden, draft, error, sync, openDraft } = useCalendarStore();
  const [view, setView] = useState<View>('month');
  const [now, setNow] = useState(() => new Date());
  const today = localDate(now);
  const [selected, setSelected] = useState<IsoDate>(today);
  const [resolving, setResolving] = useState<string | null>(null);
  const upsertDocument = useUiStore((s) => s.upsertDocument);
  const weekRef = useRef<HTMLDivElement>(null);
  const locale = i18n.language.startsWith('en') ? 'en' : 'es';

  // Hora actual para «hoy» y la línea de «ahora» (cada minuto).
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const live = documents.filter((d) => d.kind === 'calendar' && !d.deleted);
    if (live.length === 0 && !creatingDefault) {
      creatingDefault = useCalendarStore
        .getState()
        .createCalendar(service, t('calendar.defaultCalendar'), 'mantequilla')
        .catch(() => undefined);
    }
    void sync(service, documents);
  }, [documents, service, sync, t]);

  // Al seguir un enlace a un evento, se muestra su día y se abre. Se espera a que su calendario
  // esté cargado; un enlace al calendario entero solo trae a esta sección.
  const focus = useUiStore((s) => s.focus);
  useEffect(() => {
    const calendar = focus ? calendars[focus.documentId] : undefined;
    if (!focus || !calendar) return;
    useUiStore.getState().consumeFocus(focus.documentId);
    const event = calendar.data.events.find((e) => e.id === focus.eventId);
    if (!event) return;
    // Sincroniza con una orden externa (la navegación), una sola vez por enlace seguido.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(event.date);
    openDraft({ mode: 'edit', calendarId: focus.documentId, event });
  }, [focus, calendars, openDraft]);

  // Semana y día se abren a las 8:00.
  useEffect(() => {
    if (view !== 'month' && weekRef.current) weekRef.current.scrollTop = 8 * HOUR - 8;
  }, [view]);

  const events: ShownEvent[] = useMemo(
    () =>
      Object.entries(calendars)
        .filter(([id]) => !hidden.includes(id))
        .flatMap(([calendarId, c]) => c.data.events.map((e) => ({ ...e, calendarId }))),
    [calendars, hidden],
  );

  const { year, month } = monthOf(selected);
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    asDate(firstOfMonth(year, month)),
  );
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const monday = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) =>
      capitalize(format.format(asDate(addDays(monday, i))).replace('.', '')),
    );
  }, [locale, today]);
  const shortMonth = (date: IsoDate) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(asDate(date)).replace('.', '');
  const longDate = (date: IsoDate) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      asDate(date),
    );

  const move = (step: number) =>
    setSelected(
      view === 'month'
        ? addMonths(selected, step)
        : addDays(selected, view === 'week' ? step * 7 : step),
    );
  const newEvent = (date: IsoDate, start: string | null = null) =>
    openDraft({ mode: 'new', date, start, calendarId: null });
  const edit = (event: ShownEvent) => {
    const { calendarId, ...plain } = event;
    openDraft({ mode: 'edit', calendarId, event: plain });
  };

  const chipLabel = (event: ShownEvent) =>
    event.start ? `${event.start} ${event.title || t('calendar.untitled')}` : event.title;

  const header = (
    <header className="calendar-header">
      <h1 className="calendar-title">
        {capitalize(monthName)} <span className="calendar-year">{year}</span>
      </h1>
      <div className="calendar-nav">
        <button
          type="button"
          className="calendar-round"
          aria-label={
            view === 'month'
              ? t('calendar.prevMonth')
              : view === 'week'
                ? t('calendar.prevWeek')
                : t('calendar.prevDay')
          }
          data-testid="calendar-prev"
          onClick={() => move(-1)}
        >
          <Icon name="chevron-izq" size={18} />
        </button>
        <button
          type="button"
          className="calendar-round"
          aria-label={
            view === 'month'
              ? t('calendar.nextMonth')
              : view === 'week'
                ? t('calendar.nextWeek')
                : t('calendar.nextDay')
          }
          data-testid="calendar-next"
          onClick={() => move(1)}
        >
          <Icon name="chevron-der" size={18} />
        </button>
        <button type="button" data-testid="calendar-today" onClick={() => setSelected(today)}>
          {t('calendar.today')}
        </button>
      </div>
      <span className="topbar-spacer" />
      <div className="segmented" role="group" aria-label={t('calendar.view')}>
        {(['day', 'week', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            data-testid={`calendar-view-${v}`}
            className={`segmented-option${view === v ? ' is-active' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'day'
              ? t('calendar.day')
              : v === 'week'
                ? t('calendar.week')
                : t('calendar.month')}
          </button>
        ))}
      </div>
      {/* Con la biblioteca abierta, «Nuevo evento» está allí: un solo botón principal. */}
      {!libraryOpen && (
        <button
          type="button"
          className="primary"
          data-testid="calendar-new-event"
          onClick={() => newEvent(selected)}
        >
          <Icon name="mas" size={18} />
          {t('calendar.newEvent')}
        </button>
      )}
    </header>
  );

  const monthView = () => {
    const days = monthGrid(year, month);
    const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
    return (
      <div className="month-grid" role="grid" aria-label={`${capitalize(monthName)} ${year}`}>
        <div className="month-weekdays" role="row">
          {weekdays.map((name, i) => (
            <span key={name} role="columnheader" className={i >= 5 ? 'weekend' : ''}>
              {name}
            </span>
          ))}
        </div>
        {weeks.map((week) => {
          const layout = layoutWeek(week, events);
          return (
            <div className="month-week" role="row" key={week[0]}>
              {week.map((date, col) => {
                const inMonth = monthOf(date).month === month;
                const label = date.endsWith('-01')
                  ? `1 ${shortMonth(date)}`
                  : String(Number(date.slice(8)));
                return (
                  <div
                    key={date}
                    role="gridcell"
                    aria-selected={date === selected}
                    className={`month-day${col >= 5 ? ' weekend' : ''}${inMonth ? '' : ' other-month'}${
                      date === selected ? ' selected' : ''
                    }`}
                    style={{ gridColumn: col + 1 }}
                    data-date={date}
                    onDoubleClick={() => newEvent(date)}
                  >
                    <button
                      type="button"
                      className={`day-number${date === today ? ' today' : ''}`}
                      aria-label={longDate(date)}
                      aria-current={date === today ? 'date' : undefined}
                      onClick={() => setSelected(date)}
                    >
                      {label}
                    </button>
                  </div>
                );
              })}
              {layout.segments.map((s) => (
                <button
                  key={`${s.event.id}-${s.startCol}`}
                  type="button"
                  className={`event-chip event-${s.event.color}${s.event.start ? '' : ' all-day'}${
                    s.startsHere ? ' starts' : ''
                  }${s.endsHere ? ' ends' : ''}`}
                  style={{ gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`, gridRow: s.lane + 2 }}
                  data-testid="event-chip"
                  title={chipLabel(s.event as ShownEvent)}
                  onClick={() => edit(s.event as ShownEvent)}
                >
                  {s.event.start && <span className="event-time">{s.event.start}</span>}{' '}
                  <span className="event-name">{s.event.title || t('calendar.untitled')}</span>
                  <LinkMark count={s.event.links?.length ?? 0} />
                </button>
              ))}
              {layout.hidden.map((n, col) =>
                n > 0 ? (
                  <button
                    key={`more-${week[col]}`}
                    type="button"
                    className="event-more"
                    // En una celda con «+N más» solo se ven 2 carriles: va en el tercero.
                    style={{ gridColumn: col + 1, gridRow: 4 }}
                    onClick={() => {
                      setSelected(week[col]!);
                      setView('week');
                    }}
                  >
                    {t('calendar.more', { count: n })}
                  </button>
                ) : null,
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /** Semana (7 columnas) o día (1 columna): la misma retícula de horas. */
  const timeView = (single: boolean) => {
    const start = startOfWeek(selected);
    const days = single ? [selected] : Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const cols = days.length;
    const allDay = layoutWeek(
      days,
      events.filter((e) => e.start === null),
    );
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    return (
      <div
        className={`week-view${single ? ' is-day' : ''}`}
        style={{ '--cols': cols } as CSSProperties}
        data-testid={single ? 'day-view' : 'week-view'}
      >
        <div className="week-head">
          <span />
          {days.map((date) => (
            <button
              key={date}
              type="button"
              className={`week-day-head${date === selected ? ' selected' : ''}`}
              aria-label={longDate(date)}
              aria-current={date === today ? 'date' : undefined}
              onClick={() => setSelected(date)}
            >
              <span className="week-day-name">{weekdays[weekdayIndex(date)]}</span>
              <span className={`week-day-number${date === today ? ' today' : ''}`}>
                {Number(date.slice(8))}
              </span>
            </button>
          ))}
        </div>
        {allDay.segments.length > 0 && (
          <div className="week-all-day" aria-label={t('calendar.allDay')}>
            <span className="week-all-day-label">{t('calendar.allDay')}</span>
            {allDay.segments.map((s) => (
              <button
                key={`${s.event.id}-${s.startCol}`}
                type="button"
                className={`event-chip all-day event-${s.event.color}${s.startsHere ? ' starts' : ''}${
                  s.endsHere ? ' ends' : ''
                }`}
                style={{ gridColumn: `${s.startCol + 2} / ${s.endCol + 3}`, gridRow: s.lane + 1 }}
                data-testid="event-chip"
                onClick={() => edit(s.event as ShownEvent)}
              >
                <span className="event-name">{s.event.title || t('calendar.untitled')}</span>
                <LinkMark count={s.event.links?.length ?? 0} />
              </button>
            ))}
          </div>
        )}
        <div className="week-scroll" ref={weekRef}>
          <div className="week-grid" style={{ '--hour': `${HOUR}px` } as CSSProperties}>
            <div className="week-hours" aria-hidden="true">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} style={{ top: h * HOUR }}>
                  {h === 0 ? '' : `${h}:00`}
                </span>
              ))}
            </div>
            {days.map((date) => (
              <div
                key={date}
                className={`week-column${date === today ? ' today' : ''}`}
                data-date={date}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const hour = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / HOUR)));
                  newEvent(date, `${String(hour).padStart(2, '0')}:00`);
                }}
              >
                {layoutDay(date, events).map((b) => (
                  <button
                    key={b.event.id}
                    type="button"
                    className={`event-block event-${b.event.color}`}
                    style={{
                      top: (b.top / 60) * HOUR,
                      height: ((b.bottom - b.top) / 60) * HOUR - 2,
                      left: `calc(${(b.column / b.columns) * 100}% + 2px)`,
                      width: `calc(${100 / b.columns}% - 4px)`,
                    }}
                    data-testid="event-block"
                    onClick={() => edit(b.event as ShownEvent)}
                  >
                    <span className="event-name">
                      {b.event.title || t('calendar.untitled')}
                      <LinkMark count={b.event.links?.length ?? 0} />
                    </span>
                    <span className="event-range">
                      {b.event.start} – {b.event.end}
                    </span>
                  </button>
                ))}
                {date === today && (
                  <span
                    className="now-line"
                    style={{ top: (minutesNow / 60) * HOUR }}
                    aria-label={t('calendar.now')}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const conflicted = documents.filter((d) => d.kind === 'calendar' && !d.deleted && hasConflict(d));
  const conflictDoc = conflicted.find((d) => d.id === resolving) ?? null;

  return (
    <div className="calendar-view" data-testid="calendar-view">
      {header}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {conflicted.length > 0 && (
        <p className="banner banner-danger" role="alert" data-testid="calendar-conflict-banner">
          {t('calendar.conflict', { names: conflicted.map((d) => d.title).join(', ') })}{' '}
          <button
            type="button"
            data-testid="calendar-open-conflict"
            onClick={() => setResolving(conflicted[0]!.id)}
          >
            {t('conflict.resolve')}
          </button>
        </p>
      )}
      {view === 'month' ? monthView() : timeView(view === 'day')}
      {draft && <EventDialog service={service} />}
      {conflictDoc && (
        <ConflictPanel
          document={conflictDoc}
          service={service}
          onClose={() => setResolving(null)}
          onResolve={async (choice) => {
            try {
              const { result, duplicate } = await service.resolveConflict(conflictDoc.id, choice);
              upsertDocument(result.document);
              if (duplicate) upsertDocument(duplicate);
              setResolving(null);
            } catch (e) {
              useCalendarStore.setState({ error: describeError(e) });
            }
          }}
        />
      )}
    </div>
  );
}
