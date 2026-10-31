import { z } from './zod.ts';

/**
 * Reglas del pomodoro (plan 14). Un temporizador no es contenido: no crea revisiones ni se
 * sincroniza; la sesión se guarda solo en este navegador (plan 14.3). Aquí no hay reloj propio:
 * cada transición recibe el instante (`now`, en ms) y el tiempo que queda se calcula desde la hora
 * de fin, así que sobrevive a recargas, pestañas en segundo plano y equipos dormidos.
 */

/** Mascotas (DESIGN.md §2.3.1); Tofu es la de por defecto (D-14a). */
export const MASCOTS = ['tofu', 'tomi', 'pico'] as const;
export type Mascot = (typeof MASCOTS)[number];
export const DEFAULT_MASCOT: Mascot = 'tofu';

/** Estado de ánimo de la mascota: el nombre de su ilustración en `brand/mascotas/`. */
export type Mood = 'enfoque' | 'descanso' | 'pausa' | 'ultimo' | 'fin';

export type Phase = 'focus' | 'break' | 'longBreak';
/** `done`: la fase terminó y espera a que el usuario empiece la siguiente (D-14b). */
export type SessionStatus = 'running' | 'paused' | 'done';

/** Límites del modal: enfoque de 5 min a 4 h, de 1 a 8 ciclos. */
export const FOCUS_MINUTES = { min: 5, max: 240 } as const;
export const MAX_CYCLES = 8;
export const MAX_BREAK_MINUTES = 60;
/** Lo que queda nunca pasa de esto, ni sumando «+5 min». */
const MAX_REMAINING_MS = FOCUS_MINUTES.max * 60_000;
/** El último minuto del enfoque cambia la cara de la mascota. */
const LAST_MINUTE_MS = 60_000;

const minutes = (max: number) => z.number().int().min(0).max(max);

export const pomodoroConfigSchema = z.object({
  focusMinutes: z.number().int().min(FOCUS_MINUTES.min).max(FOCUS_MINUTES.max),
  breakMinutes: minutes(MAX_BREAK_MINUTES),
  /** Descanso largo tras el último ciclo (D-14c); solo con más de un ciclo. */
  longBreakMinutes: minutes(MAX_BREAK_MINUTES),
  cycles: z.number().int().min(1).max(MAX_CYCLES),
  mascot: z.enum(MASCOTS),
  sound: z.boolean(),
  notify: z.boolean(),
});
export type PomodoroConfig = z.infer<typeof pomodoroConfigSchema>;

export const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cycles: 4,
  mascot: DEFAULT_MASCOT,
  sound: true,
  notify: false,
};

const sessionSchema = z.object({
  /** Instante en que se empezó: identifica la sesión (avisos sin repetir entre pestañas). */
  startedAt: z.number(),
  config: pomodoroConfigSchema,
  phase: z.enum(['focus', 'break', 'longBreak']),
  /** Ciclo actual, desde 1. */
  cycle: z.number().int().min(1).max(MAX_CYCLES),
  status: z.enum(['running', 'paused', 'done']),
  /** Hora de fin de la fase; solo cuando corre. */
  endsAt: z.number().nullable(),
  /** Lo que quedaba al pausar (0 al terminar); cuando corre no se usa. */
  remainingMs: z.number().min(0),
});
export type PomodoroSession = z.infer<typeof sessionSchema>;

/** Configuración guardada; una corrupta o de otra versión vuelve a la de por defecto. */
export function readConfig(value: unknown): PomodoroConfig {
  const parsed = pomodoroConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

/** Sesión guardada; si no se entiende se descarta (nunca rompe el arranque). */
export function readSession(value: unknown): PomodoroSession | null {
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (s.cycle > s.config.cycles || (s.status === 'running') !== (s.endsAt !== null)) return null;
  return s;
}

export function phaseMinutes(config: PomodoroConfig, phase: Phase): number {
  if (phase === 'focus') return config.focusMinutes;
  return phase === 'break' ? config.breakMinutes : config.longBreakMinutes;
}

/** Duración total planeada, con descansos: el «Total» del modal. */
export function plannedMinutes(config: PomodoroConfig): number {
  const { focusMinutes, breakMinutes, longBreakMinutes, cycles } = config;
  return focusMinutes * cycles + breakMinutes * (cycles - 1) + (cycles > 1 ? longBreakMinutes : 0);
}

/** La fase que sigue a la actual, o null si la sesión termina con ella. */
export function nextPhase(
  session: Pick<PomodoroSession, 'config' | 'phase' | 'cycle'>,
): { phase: Phase; cycle: number } | null {
  const { config, phase, cycle } = session;
  if (phase === 'longBreak') return null;
  if (phase === 'break') return { phase: 'focus', cycle: cycle + 1 };
  if (cycle < config.cycles) {
    return config.breakMinutes > 0
      ? { phase: 'break', cycle }
      : { phase: 'focus', cycle: cycle + 1 };
  }
  return config.cycles > 1 && config.longBreakMinutes > 0 ? { phase: 'longBreak', cycle } : null;
}

function running(
  base: PomodoroSession,
  phase: Phase,
  cycle: number,
  durationMs: number,
  now: number,
): PomodoroSession {
  return { ...base, phase, cycle, status: 'running', endsAt: now + durationMs, remainingMs: 0 };
}

export function start(config: PomodoroConfig, now: number): PomodoroSession {
  const base: PomodoroSession = {
    startedAt: now,
    config,
    phase: 'focus',
    cycle: 1,
    status: 'running',
    endsAt: null,
    remainingMs: 0,
  };
  return running(base, 'focus', 1, config.focusMinutes * 60_000, now);
}

/** Si corría y ya pasó su hora de fin, queda terminada. Idempotente. */
export function settle(session: PomodoroSession, now: number): PomodoroSession {
  if (session.status !== 'running' || session.endsAt === null || now < session.endsAt) {
    return session;
  }
  return { ...session, status: 'done', endsAt: null, remainingMs: 0 };
}

export function pause(session: PomodoroSession, now: number): PomodoroSession {
  const s = settle(session, now);
  if (s.status !== 'running' || s.endsAt === null) return s;
  return { ...s, status: 'paused', endsAt: null, remainingMs: s.endsAt - now };
}

export function resume(session: PomodoroSession, now: number): PomodoroSession {
  if (session.status !== 'paused') return session;
  return { ...session, status: 'running', endsAt: now + session.remainingMs, remainingMs: 0 };
}

/** «+5 min»: alarga la fase; una terminada vuelve a correr con esos minutos. */
export function addMinutes(session: PomodoroSession, mins: number, now: number): PomodoroSession {
  const s = settle(session, now);
  const extra = mins * 60_000;
  if (s.status === 'running' && s.endsAt !== null) {
    return { ...s, endsAt: now + Math.min(MAX_REMAINING_MS, s.endsAt - now + extra) };
  }
  if (s.status === 'paused') {
    return { ...s, remainingMs: Math.min(MAX_REMAINING_MS, s.remainingMs + extra) };
  }
  return running(s, s.phase, s.cycle, Math.min(MAX_REMAINING_MS, extra), now);
}

/** «Saltar»: da la fase por terminada; la siguiente espera al usuario, como al acabar sola. */
export function skip(session: PomodoroSession, now: number): PomodoroSession {
  const s = settle(session, now);
  return { ...s, status: 'done', endsAt: null, remainingMs: 0 };
}

/** Empieza la fase siguiente; null si la sesión ha terminado. Solo desde una fase terminada. */
export function advance(session: PomodoroSession, now: number): PomodoroSession | null {
  const s = settle(session, now);
  if (s.status !== 'done') return s;
  const next = nextPhase(s);
  if (!next) return null;
  return running(s, next.phase, next.cycle, phaseMinutes(s.config, next.phase) * 60_000, now);
}

/** Identifica la fase en curso: cada fase terminada se avisa una sola vez (plan 14.7). */
export function phaseKey(session: PomodoroSession): string {
  return `${session.startedAt}:${session.cycle}:${session.phase}`;
}

export interface PomodoroView {
  phase: Phase;
  cycle: number;
  cycles: number;
  status: SessionStatus;
  /** Lo que queda, en ms (0 si terminó). */
  remainingMs: number;
  /** Duración de la fase, en ms. */
  totalMs: number;
  /** De 0 a 1. */
  progress: number;
  mood: Mood;
  /** Hora de fin prevista (también en pausa: si se reanudara ahora); null si terminó. */
  endsAt: number | null;
  /** La sesión acaba al terminar esta fase. */
  last: boolean;
}

/** Lo que la interfaz muestra en un instante: no cambia la sesión. */
export function derive(session: PomodoroSession, now: number): PomodoroView {
  const s = settle(session, now);
  const remainingMs =
    s.status === 'running' && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs;
  const totalMs = phaseMinutes(s.config, s.phase) * 60_000;
  return {
    phase: s.phase,
    cycle: s.cycle,
    cycles: s.config.cycles,
    status: s.status,
    remainingMs,
    totalMs,
    progress: totalMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / totalMs)) : 1,
    mood: moodOf(s.status, s.phase, remainingMs),
    endsAt: s.status === 'done' ? null : now + remainingMs,
    last: nextPhase(s) === null,
  };
}

function moodOf(status: SessionStatus, phase: Phase, remainingMs: number): Mood {
  if (status === 'paused') return 'pausa';
  if (status === 'done') return 'fin';
  if (phase !== 'focus') return 'descanso';
  return remainingMs <= LAST_MINUTE_MS ? 'ultimo' : 'enfoque';
}

/** «18:20» o «1:05:00»: segundos redondeados hacia arriba (no se ve «00:00» antes de tiempo). */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Minutos que quedan, redondeados hacia arriba: el chip compacto («18′»). */
export function remainingMinutes(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 60_000);
}
