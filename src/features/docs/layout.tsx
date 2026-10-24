import { useSyncExternalStore } from 'react';

/**
 * Presentación de un documento de la sección «Documentos»: texto corrido o una hoja A4. Es una
 * preferencia de este navegador por tipo (no contenido): no crea revisiones. Desde el plan 10.3 se
 * elige solo en Configuración → Preferencias e idioma; los documentos con formato salen en hoja y
 * los Markdown en continuo. La clave anterior, común a los dos (`mindnote.docLayout`), se ignora.
 */
export type DocLayout = 'continuous' | 'page';
export type DocLayoutKind = 'doc' | 'mddoc';

const DEFAULTS: Record<DocLayoutKind, DocLayout> = { doc: 'page', mddoc: 'continuous' };
const key = (kind: DocLayoutKind) => `mindnote.docLayout.${kind}`;
const listeners = new Set<() => void>();

function readLayout(kind: DocLayoutKind): DocLayout {
  try {
    const stored = localStorage.getItem(key(kind));
    return stored === 'continuous' || stored === 'page' ? stored : DEFAULTS[kind];
  } catch {
    return DEFAULTS[kind];
  }
}

const layouts: Record<DocLayoutKind, DocLayout> = {
  doc: readLayout('doc'),
  mddoc: readLayout('mddoc'),
};

export function useDocLayout(kind: DocLayoutKind): DocLayout {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => layouts[kind],
  );
}

export function setDocLayout(kind: DocLayoutKind, layout: DocLayout): void {
  layouts[kind] = layout;
  try {
    localStorage.setItem(key(kind), layout);
  } catch {
    // Sin almacenamiento del navegador: la preferencia dura lo que la pestaña.
  }
  for (const listener of listeners) listener();
}
