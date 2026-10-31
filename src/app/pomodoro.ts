import { create } from 'zustand';
import i18n from 'i18next';
import {
  addMinutes,
  advance,
  DEFAULT_CONFIG,
  derive,
  formatClock,
  pause,
  readConfig,
  readSession,
  resume,
  settle,
  skip,
  start,
  type PomodoroConfig,
  type PomodoroSession,
} from '../domain/pomodoro.ts';
import type { TimerRequest } from '../workers/pomodoroTimer.worker.ts';
import { announcePhaseEnd, primeAudio } from './pomodoroAlerts.ts';

/**
 * Estado del pomodoro (plan 14.3). Vive en este navegador (`localStorage`, como las demás
 * preferencias de interfaz) y nunca en el almacén: no crea revisiones ni se sincroniza. Las
 * pestañas abiertas comparten la misma sesión por el evento `storage`. Las reglas están en
 * `domain/pomodoro.ts`; aquí solo se aplica cada transición con la hora actual y se guarda.
 */
const KEY = 'mindnote.pomodoro';
/** Una fase que terminó hace más que esto (aplicación cerrada) ya no se avisa. */
const STALE_MS = 2 * 60_000;

interface Stored {
  config: PomodoroConfig;
  session: PomodoroSession | null;
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return { config: readConfig(raw['config']), session: readSession(raw['session']) };
  } catch {
    return { config: DEFAULT_CONFIG, session: null };
  }
}

function save(stored: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Sin almacenamiento (modo privado estricto): el pomodoro sigue en memoria.
  }
}

interface PomodoroState extends Stored {
  /** Instante de la última lectura del reloj: la interfaz se pinta con él. */
  now: number;
  dialogOpen: boolean;
  notchOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  setNotchOpen: (open: boolean) => void;
  begin: (config: PomodoroConfig) => void;
  pause: () => void;
  resume: () => void;
  addMinutes: (minutes: number) => void;
  skip: () => void;
  advance: () => void;
  stop: () => void;
  tick: () => void;
}

export const usePomodoro = create<PomodoroState>()((set, get) => {
  /** Aplica una transición a la sesión (o la quita con null) y la guarda. */
  const update = (change: (session: PomodoroSession, now: number) => PomodoroSession | null) => {
    const { session, config } = get();
    if (!session) return;
    const now = Date.now();
    const next = change(session, now);
    save({ config, session: next });
    set({ session: next, now, ...(next ? {} : { notchOpen: false }) });
  };
  return {
    ...load(),
    now: Date.now(),
    dialogOpen: false,
    notchOpen: false,
    openDialog: () => set({ dialogOpen: true }),
    closeDialog: () => set({ dialogOpen: false }),
    setNotchOpen: (notchOpen) => set({ notchOpen }),
    begin: (config) => {
      primeAudio();
      const now = Date.now();
      const session = start(config, now);
      save({ config, session });
      set({ config, session, now, dialogOpen: false });
    },
    pause: () => update(pause),
    resume: () => {
      primeAudio();
      update(resume);
    },
    addMinutes: (minutes) => {
      primeAudio();
      update((s, now) => addMinutes(s, minutes, now));
    },
    skip: () => update(skip),
    advance: () => {
      primeAudio();
      update(advance);
    },
    stop: () => update(() => null),
    tick: () => {
      const now = Date.now();
      const { session } = get();
      const settled = session && settle(session, now);
      if (session && settled && settled !== session) {
        // Al terminar una fase se guarda ya terminada: otra pestaña la ve igual.
        save({ config: get().config, session: settled });
        // Se avisa si acaba de terminar, no si terminó con la aplicación cerrada hace rato.
        if (now - (session.endsAt ?? now) < STALE_MS) {
          void announcePhaseEnd(session, () => set({ notchOpen: true }));
        }
      }
      set({ now, session: settled });
    },
  };
});

/**
 * Arranca el reloj (un tic por segundo mientras hay una sesión que corre, más un worker que
 * despierta al terminar la fase aunque la pestaña esté oculta), el título de la pestaña y la
 * sincronización entre pestañas. Devuelve la función que lo detiene.
 */
export function startPomodoroRuntime(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let worker: Worker | null = null;
  let workerEndsAt: number | null = null;
  const baseTitle = document.title;

  const wake = (endsAt: number | null) => {
    if (endsAt === workerEndsAt || typeof Worker === 'undefined') return;
    workerEndsAt = endsAt;
    if (endsAt === null && !worker) return;
    worker ??= new Worker(new URL('../workers/pomodoroTimer.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = () => usePomodoro.getState().tick();
    worker.postMessage({ endsAt } satisfies TimerRequest);
  };

  // Mientras la pestaña está oculta, el título dice lo que queda (D-14d).
  const retitle = () => {
    const { session, now } = usePomodoro.getState();
    if (!session || document.visibilityState === 'visible') {
      if (document.title !== baseTitle) document.title = baseTitle;
      return;
    }
    const view = derive(session, now);
    const left = view.status === 'done' ? i18n.t('pomodoro.done') : formatClock(view.remainingMs);
    document.title = `${left} · ${baseTitle}`;
  };

  const schedule = () => {
    const { session } = usePomodoro.getState();
    const running = session?.status === 'running';
    if (running && timer === null) timer = setInterval(() => usePomodoro.getState().tick(), 1000);
    if (!running && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    wake(running ? session.endsAt : null);
    retitle();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    const stored = load();
    usePomodoro.setState({
      ...stored,
      now: Date.now(),
      ...(stored.session ? {} : { notchOpen: false }),
    });
  };
  // Al volver a la pestaña se recalcula enseguida (los tics se espacian mientras está oculta).
  const onVisible = () => {
    if (document.visibilityState === 'visible') usePomodoro.getState().tick();
    retitle();
  };
  const unsubscribe = usePomodoro.subscribe(schedule);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisible);
  usePomodoro.getState().tick();
  schedule();
  return () => {
    unsubscribe();
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisible);
    if (timer !== null) clearInterval(timer);
    worker?.terminate();
    document.title = baseTitle;
  };
}
