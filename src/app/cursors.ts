import { useSyncExternalStore } from 'react';
import meta from '../../brand/cursors/cursors.json';

/**
 * Punteros de «aline» (plan 9.16–9.18; diseño en `brand/cursors/`, hoja de muestra aprobada el
 * 20/10/2026). Cada puntero sustituye a una palabra clave de CSS: el CSS usa siempre
 * `var(--cursor-<palabra>, <palabra>)`, y aquí se definen esas variables con el SVG y su punta.
 * Con la preferencia «del sistema» las variables se quitan y queda el puntero del sistema.
 *
 * Se usan los SVG tal cual (32×32), sin PNG: los navegadores admiten punteros SVG y los dibujan
 * nítidos en pantallas de alta densidad, sin añadir un rasterizador a `pnpm assets`.
 */
export type CursorPreference = 'aline' | 'system';

const urls = import.meta.glob<string>('../../brand/cursors/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

interface CursorInfo {
  css: string;
  hotspot: number[];
}

/** Palabra clave de CSS → valor de `cursor` con el SVG, su punta y el puntero del sistema detrás. */
export const CURSOR_VALUES: ReadonlyMap<string, string> = new Map(
  Object.entries(meta.cursors as Record<string, CursorInfo>).flatMap(([name, info]) => {
    const url = Object.entries(urls).find(([path]) => path.endsWith(`/${name}.svg`))?.[1];
    if (!url) return [];
    const [x = 0, y = 0] = info.hotspot;
    return [[info.css, `url("${url}") ${x} ${y}, ${info.css}`] as const];
  }),
);

const systemUrls = import.meta.glob<string>('../../brand/cursors/sistema/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

/**
 * Vista previa estática de Configuración (plan 10.4): los punteros básicos de «aline» junto a unos
 * dibujos genéricos de los del sistema. Una página no puede leer los del sistema operativo, así que
 * esos son orientativos (`brand/cursors/sistema/`).
 */
export const CURSOR_PREVIEW: readonly { name: string; aline: string; system: string }[] = [
  'flecha',
  'mano',
  'texto',
  'mover',
  'cargando',
].flatMap((name) => {
  const find = (all: Record<string, string>) =>
    Object.entries(all).find(([path]) => path.endsWith(`/${name}.svg`))?.[1];
  const aline = find(urls);
  const system = find(systemUrls);
  return aline && system ? [{ name, aline, system }] : [];
});

/** Palabras clave con puntero propio (las que `var(--cursor-…)` puede sustituir). */
export const CURSOR_KEYWORDS: ReadonlySet<string> = new Set(CURSOR_VALUES.keys());

const KEY = 'mindnote.cursors';
const listeners = new Set<() => void>();

let preference: CursorPreference = (() => {
  try {
    return localStorage.getItem(KEY) === 'system' ? 'system' : 'aline';
  } catch {
    return 'aline';
  }
})();

/** Define (o quita) las variables `--cursor-*` en la raíz del documento. */
export function applyCursors(pref: CursorPreference = preference): void {
  const root = document.documentElement.style;
  for (const [keyword, value] of CURSOR_VALUES) {
    if (pref === 'aline') root.setProperty(`--cursor-${keyword}`, value);
    else root.removeProperty(`--cursor-${keyword}`);
  }
}

export function useCursorPreference(): CursorPreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference,
  );
}

export function setCursorPreference(next: CursorPreference): void {
  preference = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Preferencia no persistida.
  }
  applyCursors(next);
  for (const listener of listeners) listener();
}
