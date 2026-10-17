import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import type { VaultService } from '../../application/VaultService.ts';
import {
  EVENT_COLORS,
  MAX_EVENT_LINKS,
  minutesOf,
  validateEvent,
  type CalendarEvent,
  type EventColor,
  type EventLink,
} from '../../domain/calendar.ts';
import { newId } from '../../domain/ids.ts';
import { internalLink, parseInternalLink } from '../../domain/links.ts';
import { CopiedNotice } from '../knowledge/anchorUi.tsx';
import { LinkPicker } from '../knowledge/LinkPicker.tsx';
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
  /** Cómo era al abrir: seguir un enlace guarda antes lo cambiado. */
  const [pristine] = useState(() => JSON.stringify(initial));
  const [picking, setPicking] = useState(false);
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

  /** Valida y guarda el evento. False si no es válido o no se pudo guardar. */
  const save = async (): Promise<boolean> => {
    let checked: CalendarEvent;
    try {
      checked = validateEvent({ ...event, title: event.title.trim() });
    } catch (error) {
      setProblem(
        error instanceof RangeError && /hora/.test(error.message)
          ? t('calendar.badTime')
          : t('calendar.badRange'),
      );
      return false;
    }
    if (!calendarId) return false;
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
      return true;
    } catch {
      setBusy(false);
      return false;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await save()) closeDraft();
  };

  const links = event.links ?? [];
  const addLink = (link: EventLink) => {
    setPicking(false);
    if (links.some((l) => l.url === link.url)) return;
    update({ links: [...links, link].slice(0, MAX_EVENT_LINKS) });
  };

  /**
   * Seguir un enlace del evento: lo cambiado en el diálogo se guarda antes (si no es válido, no
   * se sale). Una web se abre en el acto, dentro del gesto del usuario.
   */
  const follow = async (link: EventLink) => {
    const target = parseInternalLink(link.url);
    if (!target) window.open(link.url, '_blank', 'noopener,noreferrer');
    const changed = JSON.stringify(event) !== pristine || calendarId !== initialCalendar;
    if (changed && !readOnly && !(await save())) return;
    if (!target) {
      if (changed) closeDraft();
      return;
    }
    closeDraft();
    useUiStore.getState().navigate(linkFocus(target));
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
          {/* «Empieza» y «Termina» en la misma línea; con hora, la hora va bajo su fecha. */}
          <div className="field-pair">
            <div className="field-group">
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
            <div className="field-group">
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
        <section className="event-links" aria-labelledby="event-links-title">
          <h3 id="event-links-title" className="event-links-title">
            {t('calendar.links')}
          </h3>
          {links.length === 0 && <p className="muted small">{t('calendar.noLinks')}</p>}
          <ul className="event-link-list">
            {links.map((link, index) => (
              <li key={link.url} data-testid="event-link">
                <button
                  type="button"
                  className="link-button"
                  disabled={busy}
                  onClick={() => void follow(link)}
                >
                  <Icon name="enlace" size={16} /> {link.label || link.url}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('calendar.removeLink', { label: link.label || link.url })}
                    title={t('calendar.removeLink', { label: link.label || link.url })}
                    data-testid="event-link-remove"
                    disabled={busy}
                    onClick={() => update({ links: links.filter((_, i) => i !== index) })}
                  >
                    <Icon name="cerrar" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && links.length < MAX_EVENT_LINKS && (
            <button
              type="button"
              data-testid="event-add-link"
              disabled={busy}
              onClick={() => setPicking(true)}
            >
              {t('calendar.addLink')}
            </button>
          )}
        </section>
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
          {editing && (
            <button
              type="button"
              data-testid="event-copy-link"
              onClick={() =>
                useUiStore.getState().copyLink({
                  url: internalLink(draft.calendarId, { eventId: draft.event.id }),
                  label: draft.event.title || t('calendar.untitled'),
                  documentTitle: calendars[draft.calendarId]?.document.title ?? '',
                })
              }
            >
              {t('links.copyEventLink')}
            </button>
          )}
          <CopiedNotice />
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
      {picking && (
        // El selector va fuera del formulario (lleva el suyo para la web) y sus clics y su
        // Escape no llegan al fondo del diálogo del evento, que lo cerraría.
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <LinkPicker
            title={t('calendar.addLink')}
            sourceId={calendarId}
            service={service}
            onPick={(pick) => addLink({ url: pick.url, label: pick.title })}
            onCreateNote={(title) => {
              void service.createDocument('note', title).then((doc) => {
                useUiStore.getState().upsertDocument(doc);
                addLink({ url: internalLink(doc.id), label: doc.title });
              });
            }}
            onWeb={(url) => addLink({ url, label: url })}
            onClose={() => setPicking(false)}
          />
        </div>
      )}
    </div>
  );
}
