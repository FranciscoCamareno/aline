import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultService } from '../../application/VaultService.ts';
import {
  EVENT_COLORS,
  minutesOf,
  validateEvent,
  type CalendarEvent,
  type EventColor,
} from '../../domain/calendar.ts';
import { newId } from '../../domain/ids.ts';
import { useCalendarStore } from './calendarStore.ts';

const plusHour = (time: string) => {
  const m = Math.min(minutesOf(time) + 60, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Crear, editar o borrar un evento (DESIGN.md §8.3). Las fechas y horas usan los controles del
 * navegador; el selector de fechas propio (§8.4) queda para más adelante.
 */
export function EventDialog({ service }: { service: VaultService }) {
  const { t } = useTranslation();
  const { draft, calendars, closeDraft, saveEvents } = useCalendarStore();
  const writable = Object.values(calendars).filter((c) => !c.readOnly);
  const firstCalendar = writable[0];

  const initial: CalendarEvent =
    draft?.mode === 'edit'
      ? draft.event
      : {
          id: newId(),
          title: '',
          date: draft?.date ?? '',
          endDate: draft?.date ?? '',
          start: draft?.mode === 'new' ? draft.start : null,
          end: draft?.mode === 'new' && draft.start ? plusHour(draft.start) : null,
          color:
            (draft?.mode === 'new' && draft.calendarId
              ? calendars[draft.calendarId]?.data.color
              : firstCalendar?.data.color) ?? 'mantequilla',
        };
  const initialCalendar =
    draft?.mode === 'edit'
      ? draft.calendarId
      : (draft?.calendarId ?? firstCalendar?.document.id ?? '');

  const [event, setEvent] = useState<CalendarEvent>(initial);
  const [calendarId, setCalendarId] = useState(initialCalendar);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const allDay = event.start === null;
  const editing = draft?.mode === 'edit';

  useEffect(() => titleRef.current?.focus(), []);

  if (!draft) return null;
  const readOnly = editing && calendars[draft.calendarId]?.readOnly;

  const update = (patch: Partial<CalendarEvent>) => {
    setProblem(null);
    setEvent((e) => {
      const next = { ...e, ...patch };
      // El fin acompaña al inicio si quedaba antes.
      if (patch.date && next.endDate < patch.date) next.endDate = patch.date;
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let checked: CalendarEvent;
    try {
      checked = validateEvent({ ...event, title: event.title.trim() });
    } catch (error) {
      setProblem(
        error instanceof RangeError && /hora/.test(error.message)
          ? t('calendar.badTime')
          : t('calendar.badRange'),
      );
      return;
    }
    if (!calendarId) return;
    setBusy(true);
    try {
      if (editing && draft.calendarId !== calendarId) {
        // Cambiar de calendario: se añade al nuevo y después se quita del anterior.
        await saveEvents(service, calendarId, (events) => [...events, checked]);
        await saveEvents(service, draft.calendarId, (events) =>
          events.filter((x) => x.id !== checked.id),
        );
      } else {
        await saveEvents(service, calendarId, (events) =>
          editing ? events.map((x) => (x.id === checked.id ? checked : x)) : [...events, checked],
        );
      }
      closeDraft();
    } catch {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !window.confirm(t('calendar.deleteConfirm', { title: event.title }))) return;
    setBusy(true);
    try {
      await saveEvents(service, draft.calendarId, (events) =>
        events.filter((x) => x.id !== event.id),
      );
      closeDraft();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={closeDraft}>
      <form
        className="dialog event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-dialog-title"
        data-testid="event-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && closeDraft()}
        onSubmit={(e) => void submit(e)}
      >
        <h2 id="event-dialog-title">
          {editing ? t('calendar.editEvent') : t('calendar.newEvent')}
        </h2>
        {readOnly && <p className="notice">{t('calendar.readOnly')}</p>}
        <fieldset disabled={!!readOnly || busy} className="event-fields">
          <label className="field">
            <span>{t('calendar.eventTitle')}</span>
            <input
              ref={titleRef}
              value={event.title}
              maxLength={500}
              data-testid="event-title"
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('calendar.calendarField')}</span>
            <select
              value={calendarId}
              data-testid="event-calendar"
              onChange={(e) => setCalendarId(e.target.value)}
            >
              {writable.map((c) => (
                <option key={c.document.id} value={c.document.id}>
                  {c.document.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field-check">
            <input
              type="checkbox"
              checked={allDay}
              data-testid="event-all-day"
              onChange={(e) =>
                update(
                  e.target.checked ? { start: null, end: null } : { start: '09:00', end: '10:00' },
                )
              }
            />
            <span>{t('calendar.allDay')}</span>
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t('calendar.startDate')}</span>
              <input
                type="date"
                required
                value={event.date}
                data-testid="event-date"
                onChange={(e) => update({ date: e.target.value })}
              />
            </label>
            {!allDay && (
              <label className="field">
                <span>{t('calendar.startTime')}</span>
                <input
                  type="time"
                  required
                  value={event.start ?? ''}
                  data-testid="event-start"
                  onChange={(e) => update({ start: e.target.value })}
                />
              </label>
            )}
          </div>
          <div className="field-row">
            <label className="field">
              <span>{t('calendar.endDate')}</span>
              <input
                type="date"
                required
                min={event.date}
                value={event.endDate}
                data-testid="event-end-date"
                onChange={(e) => update({ endDate: e.target.value })}
              />
            </label>
            {!allDay && (
              <label className="field">
                <span>{t('calendar.endTime')}</span>
                <input
                  type="time"
                  required
                  value={event.end ?? ''}
                  data-testid="event-end"
                  onChange={(e) => update({ end: e.target.value })}
                />
              </label>
            )}
          </div>
          <fieldset className="color-choice">
            <legend>{t('calendar.color')}</legend>
            {EVENT_COLORS.map((color: EventColor) => (
              <label
                key={color}
                className={`color-swatch event-${color}`}
                title={t(`calendar.colors.${color}`)}
              >
                <input
                  type="radio"
                  name="event-color"
                  value={color}
                  checked={event.color === color}
                  aria-label={t(`calendar.colors.${color}`)}
                  onChange={() => update({ color })}
                />
              </label>
            ))}
          </fieldset>
        </fieldset>
        {problem && (
          <p className="field-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="dialog-actions">
          {editing && !readOnly && (
            <button
              type="button"
              className="danger"
              data-testid="event-delete"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t('calendar.delete')}
            </button>
          )}
          <span className="topbar-spacer" />
          <button type="button" onClick={closeDraft}>
            {t('title.cancel')}
          </button>
          {!readOnly && (
            <button type="submit" className="primary" data-testid="event-save" disabled={busy}>
              {t('calendar.save')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
