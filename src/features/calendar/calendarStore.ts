import { create } from 'zustand';
import { logDiagnostic } from '../../app/runtime.ts';
import { useUiStore } from '../../app/store.ts';
import type { EditSession, VaultService } from '../../application/VaultService.ts';
import type { ReadOnlyReason } from '../../domain/compat.ts';
import {
  type CalendarData,
  type CalendarEvent,
  type EventColor,
  type IsoDate,
} from '../../domain/calendar.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { describeError } from '../../ports/Diagnostics.ts';

/**
 * Estado del calendario abierto (DESIGN.md §8). Lo comparten la sección «Calendario» de la
 * biblioteca (lista, colores y casillas) y la vista. El contenido sigue siendo el del almacén:
 * cada cambio es una revisión nueva del documento `calendar` (VaultService.saveCalendar).
 */
export interface LoadedCalendar {
  document: DocumentRecord;
  session: EditSession;
  data: CalendarData;
  readOnly: ReadOnlyReason | null;
}

/** Evento que se está creando o editando en el diálogo. */
export type EventDraft =
  | { mode: 'new'; date: IsoDate; start: string | null; calendarId: string | null }
  | {
      mode: 'edit';
      calendarId: string;
      /** El evento con las fechas de la aparición elegida (las de la serie si no se repite). */
      event: CalendarEvent;
      /** Fecha de la aparición en su serie; null o ausente si el evento no se repite. */
      occurrence?: IsoDate | null;
    };

interface CalendarState {
  calendars: Record<string, LoadedCalendar>;
  /** Calendarios ocultos en este navegador (preferencia de vista, no contenido). */
  hidden: string[];
  draft: EventDraft | null;
  error: string | null;
  sync: (service: VaultService, documents: readonly DocumentRecord[]) => Promise<void>;
  saveEvents: (
    service: VaultService,
    calendarId: string,
    update: (events: CalendarEvent[]) => CalendarEvent[],
  ) => Promise<void>;
  createCalendar: (service: VaultService, title: string, color: EventColor) => Promise<void>;
  toggleHidden: (calendarId: string) => void;
  openDraft: (draft: EventDraft) => void;
  closeDraft: () => void;
}

const HIDDEN_KEY = 'mindnote.hiddenCalendars';

function readHidden(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Abiertos en curso, para no abrir dos veces el mismo calendario en paralelo. */
const opening = new Map<string, Promise<void>>();

export const useCalendarStore = create<CalendarState>()((set, get) => ({
  calendars: {},
  hidden: readHidden(),
  draft: null,
  error: null,

  async sync(service, documents) {
    const live = documents.filter((d) => d.kind === 'calendar' && !d.deleted);
    const liveIds = new Set(live.map((d) => d.id));
    // Retirados (papelera o borrados): fuera de la vista.
    const current = get().calendars;
    if (Object.keys(current).some((id) => !liveIds.has(id))) {
      set({
        calendars: Object.fromEntries(Object.entries(current).filter(([id]) => liveIds.has(id))),
      });
    }
    await Promise.all(
      live.map((doc) => {
        const loaded = get().calendars[doc.id];
        // Ya abierto y al día: sus cabezas son las que conoce la sesión (guardado propio).
        if (loaded && loaded.session.knownHeads.join() === doc.headRevisionIds.join()) {
          if (loaded.document !== doc) {
            set((s) => ({ calendars: { ...s.calendars, [doc.id]: { ...loaded, document: doc } } }));
          }
          return Promise.resolve();
        }
        const pending = opening.get(doc.id);
        if (pending) return pending;
        const task = service
          .openCalendar(doc.id)
          .then((opened) => {
            set((s) => ({
              calendars: {
                ...s.calendars,
                [doc.id]: {
                  document: opened.document,
                  session: opened.session,
                  data: opened.calendar,
                  readOnly: opened.readOnly,
                },
              },
            }));
          })
          .catch((error: unknown) => {
            logDiagnostic('error', 'calendar-open', describeError(error));
            set({ error: describeError(error) });
          })
          .finally(() => opening.delete(doc.id));
        opening.set(doc.id, task);
        return task;
      }),
    );
  },

  async saveEvents(service, calendarId, update) {
    const loaded = get().calendars[calendarId];
    if (!loaded) return;
    const data: CalendarData = { ...loaded.data, events: update(loaded.data.events) };
    // Se muestra al momento; si el guardado falla, se vuelve al contenido guardado.
    set((s) => ({ calendars: { ...s.calendars, [calendarId]: { ...loaded, data } } }));
    const status = useUiStore.getState().setSaveStatus;
    status('pending-changes');
    try {
      const result = await service.saveCalendar(loaded.session, data);
      set((s) => ({
        error: null,
        calendars: {
          ...s.calendars,
          [calendarId]: { ...s.calendars[calendarId]!, document: result.document },
        },
      }));
      // La lista de documentos conoce las cabezas nuevas: así no se vuelve a abrir.
      useUiStore.getState().upsertDocument(result.document);
      status(result.status === 'conflict' ? 'conflict' : 'saved-local');
    } catch (error) {
      set((s) => ({
        error: describeError(error),
        calendars: { ...s.calendars, [calendarId]: loaded },
      }));
      status('error');
      throw error;
    }
  },

  async createCalendar(service, title, color) {
    const doc = await service.createCalendar(title, color);
    useUiStore.getState().upsertDocument(doc);
  },

  toggleHidden(calendarId) {
    const hidden = get().hidden.includes(calendarId)
      ? get().hidden.filter((id) => id !== calendarId)
      : [...get().hidden, calendarId];
    set({ hidden });
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
    } catch {
      // Preferencia no persistida; no afecta al contenido.
    }
  },

  openDraft: (draft) => set({ draft }),
  closeDraft: () => set({ draft: null }),
}));
