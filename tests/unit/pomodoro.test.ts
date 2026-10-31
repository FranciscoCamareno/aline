import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  advance,
  DEFAULT_CONFIG,
  derive,
  formatClock,
  nextPhase,
  pause,
  phaseKey,
  plannedMinutes,
  readConfig,
  readSession,
  remainingMinutes,
  resume,
  settle,
  skip,
  start,
  type PomodoroConfig,
  type PomodoroSession,
} from '../../src/domain/pomodoro.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 31, 10, 0, 0);
const config = (patch: Partial<PomodoroConfig> = {}): PomodoroConfig => ({
  ...DEFAULT_CONFIG,
  ...patch,
});

describe('pomodoro: reglas (plan 14.2)', () => {
  it('por defecto: 25 min, 5 de descanso, 4 ciclos, descanso largo de 15 y Tofu', () => {
    expect(DEFAULT_CONFIG).toMatchObject({
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      cycles: 4,
      mascot: 'tofu',
    });
    expect(plannedMinutes(DEFAULT_CONFIG)).toBe(25 * 4 + 5 * 3 + 15);
    expect(plannedMinutes(config({ cycles: 1 }))).toBe(25);
  });

  it('el tiempo se calcula desde la hora de fin, sin contar tics', () => {
    const s = start(DEFAULT_CONFIG, T0);
    expect(s).toMatchObject({ phase: 'focus', cycle: 1, status: 'running', endsAt: T0 + 25 * MIN });
    const v = derive(s, T0 + 6 * MIN + 40_000);
    expect(formatClock(v.remainingMs)).toBe('18:20');
    expect(v.progress).toBeCloseTo(400 / 1500);
    expect(v.mood).toBe('enfoque');
    expect(v.endsAt).toBe(T0 + 25 * MIN);
  });

  it('la mascota cambia de cara: último minuto, pausa, descanso y fin', () => {
    const s = start(DEFAULT_CONFIG, T0);
    expect(derive(s, T0 + 24 * MIN).mood).toBe('ultimo');
    expect(derive(pause(s, T0 + MIN), T0 + 2 * MIN).mood).toBe('pausa');
    expect(derive(s, T0 + 25 * MIN).mood).toBe('fin');
    const rest = advance(s, T0 + 26 * MIN);
    expect(rest && derive(rest, T0 + 27 * MIN).mood).toBe('descanso');
  });

  it('pausar congela lo que queda y reanudar lo devuelve', () => {
    const paused = pause(start(DEFAULT_CONFIG, T0), T0 + 10 * MIN);
    expect(paused).toMatchObject({ status: 'paused', endsAt: null, remainingMs: 15 * MIN });
    expect(derive(paused, T0 + 60 * MIN).remainingMs).toBe(15 * MIN);
    const again = resume(paused, T0 + 60 * MIN);
    expect(again).toMatchObject({ status: 'running', endsAt: T0 + 75 * MIN });
  });

  it('al acabar no empieza sola la fase siguiente (D-14b)', () => {
    const s = start(DEFAULT_CONFIG, T0);
    const late = settle(s, T0 + 3 * 60 * MIN);
    expect(late).toMatchObject({ status: 'done', phase: 'focus', remainingMs: 0 });
    expect(settle(late, T0 + 4 * 60 * MIN)).toBe(late);
    expect(derive(s, T0 + 3 * 60 * MIN).endsAt).toBeNull();
    // Pausar o reanudar una fase terminada no la resucita.
    expect(pause(s, T0 + 30 * MIN).status).toBe('done');
    expect(resume(late, T0 + 30 * MIN)).toBe(late);
  });

  it('secuencia: enfoque, descanso… y descanso largo tras el último ciclo (D-14c)', () => {
    const seq: string[] = [];
    let s: PomodoroSession | null = start(config({ cycles: 2 }), T0);
    let now = T0;
    while (s) {
      seq.push(`${s.phase}${s.cycle}`);
      now += 60 * MIN;
      s = advance(s, now);
    }
    expect(seq).toEqual(['focus1', 'break1', 'focus2', 'longBreak2']);
  });

  it('sin descanso se pasa al siguiente enfoque; con un ciclo no hay descanso largo', () => {
    const base = { phase: 'focus' as const, cycle: 1 };
    expect(nextPhase({ ...base, config: config({ breakMinutes: 0 }) })).toEqual({
      phase: 'focus',
      cycle: 2,
    });
    expect(nextPhase({ ...base, config: config({ cycles: 1 }) })).toBeNull();
    expect(
      nextPhase({ phase: 'focus', cycle: 4, config: config({ longBreakMinutes: 0 }) }),
    ).toBeNull();
    expect(derive(start(config({ cycles: 1 }), T0), T0).last).toBe(true);
  });

  it('avanzar solo desde una fase terminada', () => {
    const s = start(DEFAULT_CONFIG, T0);
    expect(advance(s, T0 + MIN)).toBe(s);
    const rest = advance(skip(s, T0 + MIN), T0 + 2 * MIN);
    expect(rest).toMatchObject({ phase: 'break', cycle: 1, endsAt: T0 + 7 * MIN });
  });

  it('+5 min alarga la fase, también en pausa o ya terminada, con un tope de 4 h', () => {
    const s = start(DEFAULT_CONFIG, T0);
    expect(addMinutes(s, 5, T0).endsAt).toBe(T0 + 30 * MIN);
    expect(addMinutes(pause(s, T0), 5, T0 + MIN).remainingMs).toBe(30 * MIN);
    const revived = addMinutes(s, 5, T0 + 40 * MIN);
    expect(revived).toMatchObject({ status: 'running', phase: 'focus', endsAt: T0 + 45 * MIN });
    let long = s;
    for (let i = 0; i < 60; i++) long = addMinutes(long, 5, T0);
    expect(long.endsAt).toBe(T0 + 240 * MIN);
  });

  it('cada fase tiene su clave, para avisar una sola vez', () => {
    const s = start(DEFAULT_CONFIG, T0);
    const rest = advance(skip(s, T0), T0);
    expect(rest && phaseKey(rest)).not.toBe(phaseKey(s));
    expect(phaseKey(pause(s, T0 + MIN))).toBe(phaseKey(s));
  });

  it('lectura tolerante de lo guardado', () => {
    const s = start(DEFAULT_CONFIG, T0);
    expect(readSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(readSession(null)).toBeNull();
    expect(readSession({ ...s, status: 'paused' })).toBeNull(); // pausada con hora de fin
    expect(readSession({ ...s, cycle: 9 })).toBeNull();
    expect(readSession({ ...s, config: { ...s.config, mascot: 'ali' } })).toBeNull();
    expect(readConfig({ ...DEFAULT_CONFIG, focusMinutes: 2 })).toEqual(DEFAULT_CONFIG);
    expect(readConfig({ ...DEFAULT_CONFIG, mascot: 'pico' }).mascot).toBe('pico');
  });

  it('formato del reloj y de los minutos', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(400)).toBe('00:01');
    expect(formatClock(65 * MIN)).toBe('1:05:00');
    expect(remainingMinutes(17 * MIN + 1)).toBe(18);
  });
});
