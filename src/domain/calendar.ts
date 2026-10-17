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
