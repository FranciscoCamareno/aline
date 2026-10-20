import { useSyncExternalStore } from 'react';

/**
 * Qué hace el botón de plegar la barra lateral (plan 9.19): ocultarla del todo (como hasta ahora)
 * o dejar una columna de iconos. Preferencia de este navegador, en Configuración → Apariencia.
 */
export type SidebarCollapse = 'hide' | 'rail';

const KEY = 'mindnote.sidebarCollapse';
const listeners = new Set<() => void>();

let mode: SidebarCollapse = (() => {
  try {
    return localStorage.getItem(KEY) === 'rail' ? 'rail' : 'hide';
  } catch {
    return 'hide';
  }
})();

export function useSidebarCollapse(): SidebarCollapse {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => mode,
  );
}

export function setSidebarCollapse(next: SidebarCollapse): void {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Preferencia no persistida.
  }
  for (const listener of listeners) listener();
}
