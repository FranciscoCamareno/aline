import { useSyncExternalStore } from 'react';

/**
 * Tema de la interfaz (docs/DESIGN.md): sigue al sistema salvo que el usuario elija uno. Como el
 * idioma, es una preferencia de este navegador en `localStorage`, que se lee de forma síncrona
 * para fijar `data-theme` antes del primer pintado. No forma parte del contenido.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'mindnote.theme';
const darkQuery = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Almacenamiento no disponible: se sigue al sistema.
  }
  return 'system';
}

let preference = readPreference();

function systemTheme(): Theme {
  return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
}

export function resolvedTheme(): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

/** Aplica el tema al documento; los tokens de color cuelgan de `:root[data-theme]`. */
function apply(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset['theme'] = theme;
  // Barra del navegador y de la PWA instalada: el color del panel superior.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#24211B' : '#F8F2E1');
}

function notify(): void {
  apply();
  for (const listener of listeners) listener();
}

/** Se llama una vez al arrancar, antes de montar React. */
export function initTheme(): void {
  apply();
  window.matchMedia(darkQuery).addEventListener('change', () => {
    if (preference === 'system') notify();
  });
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preferencia no persistida; no afecta al contenido.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { theme: Theme; preference: ThemePreference } {
  const theme = useSyncExternalStore(subscribe, resolvedTheme);
  const pref = useSyncExternalStore(subscribe, () => preference);
  return { theme, preference: pref };
}
