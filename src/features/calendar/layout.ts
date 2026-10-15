import {
  compareEvents,
  daysBetween,
  minutesOf,
  overlaps,
  type CalendarEvent,
  type IsoDate,
} from '../../domain/calendar.ts';

/**
 * Colocación de eventos (DESIGN.md §8.2–8.3), sin React: se prueba aparte.
 *
 * Vista de mes: cada semana es una fila de 7 columnas con carriles. Un evento de varios días es
 * una barra continua en su carril; una celda muestra hasta 3 eventos, y si tiene más, 2 y
 * «+N más».
 */
export interface WeekSegment {
  event: CalendarEvent;
  lane: number;
  /** Columnas (0–6) que ocupa este tramo visible, incluidas. */
  startCol: number;
  endCol: number;
  /** ¿El evento empieza o termina en este tramo? Solo ahí la barra lleva esquinas redondeadas. */
  startsHere: boolean;
  endsHere: boolean;
}

export interface WeekLayout {
  segments: WeekSegment[];
  /** Eventos que no caben, por columna («+N más»). */
  hidden: number[];
  /** Carriles visibles en la fila (para reservar su alto). */
  lanes: number;
}

const MAX_SHOWN = 3;
const SHOWN_WITH_MORE = 2;

export function layoutWeek(days: readonly IsoDate[], events: readonly CalendarEvent[]): WeekLayout {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const inWeek = events.filter((e) => overlaps(e, first, last)).sort(compareEvents);

  // Carril más bajo libre en todas las columnas del evento.
  const occupied: boolean[][] = [];
  const placed = inWeek.map((event) => {
    const startCol = Math.max(0, daysBetween(first, event.date));
    const endCol = Math.min(days.length - 1, daysBetween(first, event.endDate));
    let lane = 0;
    while (occupied[lane]?.slice(startCol, endCol + 1).some(Boolean)) lane++;
    occupied[lane] ??= Array<boolean>(days.length).fill(false);
    for (let c = startCol; c <= endCol; c++) occupied[lane]![c] = true;
    return { event, lane, startCol, endCol };
  });

  const count = days.map((_, c) => placed.filter((p) => p.startCol <= c && p.endCol >= c).length);
  const limit = count.map((n) => (n <= MAX_SHOWN ? MAX_SHOWN : SHOWN_WITH_MORE));
  const shown = days.map(() => 0);

  const segments: WeekSegment[] = [];
  for (const p of placed) {
    let runStart: number | null = null;
    for (let c = p.startCol; c <= p.endCol + 1; c++) {
      const visible = c <= p.endCol && p.lane < limit[c]!;
      if (visible) {
        shown[c]!++;
        runStart ??= c;
      } else if (runStart !== null) {
        segments.push({
          event: p.event,
          lane: p.lane,
          startCol: runStart,
          endCol: c - 1,
          startsHere: runStart === p.startCol && p.event.date >= first,
          endsHere: c - 1 === p.endCol && p.event.endDate <= last,
        });
        runStart = null;
      }
    }
  }
  const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
  return { segments, hidden: count.map((n, c) => n - shown[c]!), lanes };
}

/**
 * Vista de semana: bloques con hora de un día. Los que se solapan se reparten el ancho en
 * columnas; un evento de varios días con hora se corta en cada día que ocupa.
 */
export interface TimedBlock {
  event: CalendarEvent;
  /** Minutos desde medianoche en ese día. */
  top: number;
  bottom: number;
  column: number;
  columns: number;
}

const DAY_MINUTES = 24 * 60;
/** Alto mínimo de un bloque (un evento de 0 minutos sigue siendo visible). */
const MIN_BLOCK = 20;

export function layoutDay(day: IsoDate, events: readonly CalendarEvent[]): TimedBlock[] {
  const timed = events
    .filter((e) => e.start !== null && e.end !== null && overlaps(e, day, day))
    .map((event) => {
      const top = event.date === day ? minutesOf(event.start!) : 0;
      const end = event.endDate === day ? minutesOf(event.end!) : DAY_MINUTES;
      return { event, top, bottom: Math.max(end, top + MIN_BLOCK) };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  // Grupos de bloques que se solapan entre sí; dentro, la primera columna libre.
  const blocks: TimedBlock[] = [];
  let group: TimedBlock[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const columns = group.reduce((max, b) => Math.max(max, b.column + 1), 0);
    for (const b of group) b.columns = columns;
    blocks.push(...group);
    group = [];
  };
  for (const item of timed) {
    if (item.top >= groupEnd && group.length) closeGroup();
    const used = new Set(group.filter((b) => b.bottom > item.top).map((b) => b.column));
    let column = 0;
    while (used.has(column)) column++;
    group.push({ ...item, column, columns: 1 });
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  if (group.length) closeGroup();
  return blocks;
}
