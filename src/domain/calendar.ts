import { z } from 'zod';
import type { ReadOnlyReason } from './compat.ts';
import { parseInternalLink } from './links.ts';

/**
 * Calendario (DESIGN.md §8): un documento por calendario con sus eventos en JSON. Las fechas son
 * locales y sin zona horaria («2026-10-13», «09:30»): un evento a las 9:00 sigue a las 9:00 si
 * se viaja o se cambia la hora del equipo, como en una agenda de papel.
 */
export const CALENDAR_SCHEMA_VERSION = 1 as const;

/** Los colores de las notas adhesivas: un color significa lo mismo en el lienzo y aquí. */
export const EVENT_COLORS = ['mantequilla', 'agua', 'rosa', 'brote', 'durazno', 'lavanda'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Enlace de un evento (desde el 16/10/2026): a cualquier documento o fragmento
 * (`aline://document/…`, formato §2.3.1) o a una web (http/https). Nada más: ni `javascript:` ni
 * otros esquemas (diseño §13).
 */
export const eventLinkSchema = z.looseObject({
  url: z
    .string()
    .max(4000)
    .refine((url) => parseInternalLink(url) !== null || /^https?:\/\/[^\s]+$/i.test(url)),
  label: z.string().max(500),
});
export type EventLink = z.infer<typeof eventLinkSchema>;

/** Máximo de enlaces por evento. */
export const MAX_EVENT_LINKS = 50;

/** Frecuencias de repetición (desde el 20/10/2026, plan 9.11). */
export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

/** Máximo de repeticiones de una serie con número fijo, y de excepciones. */
export const MAX_RECURRENCE_COUNT = 1000;

/**
 * Repetición de un evento: cada `interval` días, semanas, meses o años desde `date`. Termina en
 * `until` (último día posible, incluido), tras `count` apariciones, o nunca. `exceptions` son las
 * fechas de inicio de las apariciones quitadas (borradas, o editadas aparte como evento propio).
 * Mensual y anual repiten el mismo día del mes: si un mes no lo tiene (31, 29 de febrero), ese
 * mes se salta.
 */
export const recurrenceSchema = z
  .looseObject({
    freq: z.enum(RECURRENCE_FREQS),
    interval: z.number().int().min(1).max(99),
    /** Semanal: días de la semana (0 = lunes … 6 = domingo). Sin la clave, el día de `date`. */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    until: dateSchema.optional(),
    count: z.number().int().min(1).max(MAX_RECURRENCE_COUNT).optional(),
    exceptions: z.array(dateSchema).max(MAX_RECURRENCE_COUNT).optional(),
  })
  .refine((r) => r.until === undefined || r.count === undefined);
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const calendarEventSchema = z.looseObject({
  id: z.uuid(),
  title: z.string().max(500),
  /** Primer día. */
  date: dateSchema,
  /** Último día, incluido (igual que `date` si dura un día). */
  endDate: dateSchema,
  /** Sin hora de inicio: evento de todo el día. */
  start: timeSchema.nullable(),
  end: timeSchema.nullable(),
  color: z.enum(EVENT_COLORS),
  /** Enlaces del evento. Opcional: los eventos anteriores no lo tienen. */
  links: z.array(eventLinkSchema).max(MAX_EVENT_LINKS).optional(),
  /** Repetición (desde el 20/10/2026). Sin la clave, el evento no se repite. */
  recurrence: recurrenceSchema.optional(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarSchema = z.looseObject({
  schemaVersion: z.literal(CALENDAR_SCHEMA_VERSION),
  /** Color con el que se crean sus eventos y el de su casilla en la biblioteca. */
  color: z.enum(EVENT_COLORS),
  events: z.array(calendarEventSchema).max(20_000),
});
export type CalendarData = z.infer<typeof calendarSchema>;

export function emptyCalendar(color: EventColor = 'mantequilla'): CalendarData {
  return { schemaVersion: CALENDAR_SCHEMA_VERSION, color, events: [] };
}

/**
 * Lectura tolerante (diseño §5, compatibilidad): una versión posterior o un contenido inválido
 * se muestran en solo lectura y nunca se reescriben.
 */
export function parseCalendar(value: unknown): {
  calendar: CalendarData;
  readOnly: ReadOnlyReason | null;
} {
  const version =
    value && typeof value === 'object' ? (value as { schemaVersion?: unknown }).schemaVersion : 0;
  if (typeof version === 'number' && version > CALENDAR_SCHEMA_VERSION) {
    const events = z.array(calendarEventSchema).safeParse((value as { events?: unknown }).events);
    return {
      calendar: { ...emptyCalendar(), events: events.success ? events.data : [] },
      readOnly: 'unsupported-version',
    };
  }
  const parsed = calendarSchema.safeParse(value);
  return parsed.success
    ? { calendar: parsed.data, readOnly: null }
    : { calendar: emptyCalendar(), readOnly: 'invalid-content' };
}

/** Un evento coherente: fin no anterior al inicio, y ambas horas o ninguna. */
export function validateEvent(event: CalendarEvent): CalendarEvent {
  if (event.endDate < event.date) throw new RangeError('El evento termina antes de empezar');
  if ((event.start === null) !== (event.end === null)) {
    throw new RangeError('Un evento con hora necesita inicio y fin');
  }
  if (event.start && event.end && event.date === event.endDate && event.end < event.start) {
    throw new RangeError('La hora de fin es anterior a la de inicio');
  }
  if (event.recurrence?.until && event.recurrence.until < event.date) {
    throw new RangeError('La repetición termina antes de empezar');
  }
  return calendarEventSchema.parse(event);
}

// --- Fechas locales «AAAA-MM-DD» (aritmética en UTC para no depender de la zona horaria) ---

export type IsoDate = string;

const toUtc = (date: IsoDate) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

/** Fecha local de un instante (la del equipo, no la de UTC). */
export function localDate(at: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** 0 = lunes … 6 = domingo, con la semana empezando en `weekStartsOn` (1 = lunes, 0 = domingo). */
export function weekdayIndex(date: IsoDate, weekStartsOn: 0 | 1 = 1): number {
  const sundayBased = new Date(toUtc(date)).getUTCDay();
  return (sundayBased - weekStartsOn + 7) % 7;
}

export function startOfWeek(date: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate {
  return addDays(date, -weekdayIndex(date, weekStartsOn));
}

export function monthOf(date: IsoDate): { year: number; month: number } {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return { year: y, month: m };
}

export function firstOfMonth(year: number, month: number): IsoDate {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month } = monthOf(date);
  const index = year * 12 + (month - 1) + months;
  return firstOfMonth(Math.floor(index / 12), (index % 12) + 1);
}

/** Las 42 fechas (6 semanas) de la cuadrícula de un mes. */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 1): IsoDate[] {
  const start = startOfWeek(firstOfMonth(year, month), weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** ¿El evento cae en algún día del intervalo [from, to]? */
export function overlaps(event: CalendarEvent, from: IsoDate, to: IsoDate): boolean {
  return event.date <= to && event.endDate >= from;
}

/** Minutos desde medianoche de «HH:MM». */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Orden de los eventos de un día: primero los de varios días, luego todo el día, luego por hora. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  const spanA = daysBetween(a.date, a.endDate);
  const spanB = daysBetween(b.date, b.endDate);
  if (spanA !== spanB) return spanB - spanA;
  if ((a.start === null) !== (b.start === null)) return a.start === null ? -1 : 1;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.start && b.start && a.start !== b.start) return a.start < b.start ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/**
 * Fusión de versiones en conflicto (DESIGN.md §8.6): la unión de los eventos por `id`. Si un
 * evento está en varias versiones, vale el de la versión más reciente (la última de la lista).
 * Un evento borrado en una versión reaparece si otra lo conserva: nada se pierde en silencio.
 */
export function mergeCalendars(versions: readonly CalendarData[]): CalendarData {
  const latest = versions.at(-1);
  if (!latest) return emptyCalendar();
  const events = new Map<string, CalendarEvent>();
  for (const version of versions) {
    for (const event of version.events) events.set(event.id, event);
  }
  return { ...latest, events: [...events.values()].sort(compareEvents) };
}

// --- Repetición (plan 9.11) ---

/** Una aparición de un evento: el evento con las fechas de ese día y la fecha que la identifica. */
export type Occurrence = CalendarEvent & {
  /** Fecha de inicio de la aparición en la serie (null: el evento no se repite). */
  occurrence: IsoDate | null;
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Fechas de inicio de una serie, en orden, desde `event.date`. Se detiene en `until`, en `count`,
 * cuando una fecha pasa de `before` (sin incluirla) o tras demasiados intentos. Las excepciones
 * cuentan para `count`, como en iCalendar.
 */
function* seriesStarts(event: CalendarEvent, before: IsoDate): Generator<IsoDate> {
  const rule = event.recurrence;
  if (!rule) {
    if (event.date < before) yield event.date;
    return;
  }
  const limit = rule.until ?? '9999-12-31';
  let produced = 0;
  const emit = function* (date: IsoDate) {
    if (date < event.date) return false;
    if (date > limit || date >= before) return true;
    produced++;
    yield date;
    return rule.count !== undefined && produced >= rule.count;
  };
  const { year, month } = monthOf(event.date);
  const day = Number(event.date.slice(8));
  // Se recorre desde el inicio (hace falta para `count`); 200 000 pasos son más de 500 años diarios.
  for (let k = 0, guard = 0; guard < 200_000; k++, guard++) {
    let stop = false;
    if (rule.freq === 'daily') {
      stop = yield* emit(addDays(event.date, k * rule.interval));
    } else if (rule.freq === 'weekly') {
      const week = addDays(startOfWeek(event.date), k * 7 * rule.interval);
      const days = [...new Set(rule.weekdays ?? [weekdayIndex(event.date)])].sort((a, b) => a - b);
      for (const d of days) {
        stop = yield* emit(addDays(week, d));
        if (stop) break;
      }
      if (week >= before) stop = true;
    } else {
      const months = rule.freq === 'monthly' ? k * rule.interval : k * rule.interval * 12;
      const index = year * 12 + (month - 1) + months;
      const y = Math.floor(index / 12);
      const m = (index % 12) + 1;
      if (y > 9999) break;
      if (day <= daysInMonth(y, m)) {
        stop = yield* emit(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      } else if (firstOfMonth(y, m) >= before) {
        stop = true;
      }
    }
    if (stop) return;
  }
}

/**
 * Apariciones de un evento que caen en algún día de [from, to]. Un evento sin repetición da él
 * mismo si cae en el intervalo. Las excepciones no aparecen.
 */
export function occurrencesBetween(event: CalendarEvent, from: IsoDate, to: IsoDate): Occurrence[] {
  const span = daysBetween(event.date, event.endDate);
  if (!event.recurrence) return overlaps(event, from, to) ? [{ ...event, occurrence: null }] : [];
  const skipped = new Set(event.recurrence.exceptions ?? []);
  const out: Occurrence[] = [];
  for (const date of seriesStarts(event, addDays(to, 1))) {
    const endDate = addDays(date, span);
    if (endDate < from || skipped.has(date)) continue;
    out.push({ ...event, date, endDate, occurrence: date });
  }
  return out;
}

/** Todas las apariciones de varios eventos en [from, to], ordenadas para mostrarlas. */
export function expandEvents<T extends CalendarEvent>(
  events: readonly T[],
  from: IsoDate,
  to: IsoDate,
): Array<T & Occurrence> {
  return events
    .flatMap((event) => occurrencesBetween(event, from, to) as Array<T & Occurrence>)
    .sort(compareEvents);
}

/** Quita una aparición de la serie (borrar «solo este», o editarlo aparte). */
export function withException(event: CalendarEvent, occurrence: IsoDate): CalendarEvent {
  if (!event.recurrence) return event;
  const exceptions = [...new Set([...(event.recurrence.exceptions ?? []), occurrence])].sort();
  return { ...event, recurrence: { ...event.recurrence, exceptions } };
}

/**
 * Edita toda la serie desde una de sus apariciones: los cambios de fecha de la aparición se
 * aplican al inicio de la serie con el mismo desplazamiento; las excepciones se desplazan igual.
 */
export function editSeries(
  master: CalendarEvent,
  occurrence: IsoDate,
  edited: CalendarEvent,
): CalendarEvent {
  const shift = daysBetween(occurrence, edited.date);
  const span = daysBetween(edited.date, edited.endDate);
  const date = addDays(master.date, shift);
  const recurrence = edited.recurrence && {
    ...edited.recurrence,
    ...(edited.recurrence.exceptions?.length
      ? { exceptions: edited.recurrence.exceptions.map((d) => addDays(d, shift)) }
      : {}),
  };
  const next: CalendarEvent = { ...edited, id: master.id, date, endDate: addDays(date, span) };
  if (recurrence) next.recurrence = recurrence;
  else delete next.recurrence;
  return next;
}

/** Número de semana ISO 8601 (la que contiene el jueves; semanas de lunes a domingo). */
export function isoWeek(date: IsoDate): number {
  const thursday = addDays(date, 3 - weekdayIndex(date));
  const firstThursday = addDays(
    `${thursday.slice(0, 4)}-01-04`,
    3 - weekdayIndex(`${thursday.slice(0, 4)}-01-04`),
  );
  return 1 + Math.round(daysBetween(firstThursday, thursday) / 7);
}
