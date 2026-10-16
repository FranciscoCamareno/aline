import { useSyncExternalStore } from 'react';
import {
  DEFAULT_DARK_SCHEME,
  DEFAULT_LIGHT_SCHEME,
  isDarkScheme,
  isLightScheme,
  SCHEME_PANEL,
  type DarkScheme,
  type LightScheme,
  type Scheme,
} from './schemes.ts';

/**
 * Tema de la interfaz (docs/DESIGN.md): sigue al sistema salvo que el usuario elija uno. Como el
 * idioma, es una preferencia de este navegador en `localStorage`, que se lee de forma síncrona
 * para fijar `data-theme` y `data-scheme` antes del primer pintado. No forma parte del contenido.
 *
 * Esquemas (DESIGN.md §2.5): el usuario elige un esquema claro y uno oscuro (por defecto Papel y
 * Noche); el interruptor de la cabecera alterna entre los dos y «Seguir al sistema» usa el que
 * toque. Cada elección se recuerda.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'mindnote.theme';
const LIGHT_SCHEME_KEY = 'mindnote.scheme.light';
const DARK_SCHEME_KEY = 'mindnote.scheme.dark';
const darkQuery = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Almacenamiento no disponible: valores por defecto.
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Preferencia no persistida; no afecta al contenido.
  }
}

function readPreference(): ThemePreference {
  const stored = read(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

let preference = readPreference();
let lightScheme: LightScheme = ((value) => (isLightScheme(value) ? value : DEFAULT_LIGHT_SCHEME))(
  read(LIGHT_SCHEME_KEY),
);
let darkScheme: DarkScheme = ((value) => (isDarkScheme(value) ? value : DEFAULT_DARK_SCHEME))(
  read(DARK_SCHEME_KEY),
);

function systemTheme(): Theme {
  return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
}

export function resolvedTheme(): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

/** Esquema activo: el claro o el oscuro elegidos, según el tema resuelto. */
export function activeScheme(): Scheme {
  return resolvedTheme() === 'dark' ? darkScheme : lightScheme;
}

/** Aplica tema y esquema; los tokens cuelgan de `:root[data-theme]` y `:root[data-scheme]`. */
function apply(): void {
  const theme = resolvedTheme();
  const scheme = activeScheme();
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.dataset['scheme'] = scheme;
  // Barra del navegador y de la PWA instalada: el color del panel superior.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SCHEME_PANEL[scheme]);
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
  write(STORAGE_KEY, next === 'system' ? null : next);
  notify();
}

/** Esquema claro u oscuro elegido en Preferencias; se aplica en cuanto toca su modo. */
export function setScheme(scheme: Scheme): void {
  if (isLightScheme(scheme)) {
    lightScheme = scheme;
    write(LIGHT_SCHEME_KEY, scheme === DEFAULT_LIGHT_SCHEME ? null : scheme);
  } else {
    darkScheme = scheme;
    write(DARK_SCHEME_KEY, scheme === DEFAULT_DARK_SCHEME ? null : scheme);
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): {
  theme: Theme;
  preference: ThemePreference;
  scheme: Scheme;
  lightScheme: LightScheme;
  darkScheme: DarkScheme;
} {
  const theme = useSyncExternalStore(subscribe, resolvedTheme);
  const pref = useSyncExternalStore(subscribe, () => preference);
  const scheme = useSyncExternalStore(subscribe, activeScheme);
  const light = useSyncExternalStore(subscribe, () => lightScheme);
  const dark = useSyncExternalStore(subscribe, () => darkScheme);
  return { theme, preference: pref, scheme, lightScheme: light, darkScheme: dark };
}
