import { useSyncExternalStore } from 'react';

/**
 * Preferencias del calendario en este navegador (plan 9.12): día en que empieza la semana
 * (DESIGN.md §8.1: lunes por defecto, configurable). Es presentación, no contenido.
 */
const WEEK_START_KEY = 'mindnote.weekStart';
const listeners = new Set<() => void>();

function readWeekStart(): 0 | 1 {
  try {
    return localStorage.getItem(WEEK_START_KEY) === 'sunday' ? 0 : 1;
  } catch {
    return 1;
  }
}

let weekStart = readWeekStart();

/** 1 = lunes, 0 = domingo. */
export function useWeekStart(): 0 | 1 {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => weekStart,
  );
}

export function setWeekStart(value: 0 | 1): void {
  weekStart = value;
  try {
    localStorage.setItem(WEEK_START_KEY, value === 0 ? 'sunday' : 'monday');
  } catch {
    // Preferencia no persistida; no afecta al contenido.
  }
  for (const listener of listeners) listener();
}
