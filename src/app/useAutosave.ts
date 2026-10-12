import { useEffect, useLayoutEffect, useState } from 'react';
import { DomainError } from '../domain/errors.ts';
import { describeError } from '../ports/Diagnostics.ts';
import type { CommitResult } from '../ports/VaultRepository.ts';
import { createCoalescer, type Coalescer } from '../shared/coalesce.ts';
import { logDiagnostic, registerFlusher } from './runtime.ts';
import { useUiStore } from './store.ts';

type Saver<T> = (value: T) => Promise<CommitResult>;

interface Autosave<T> extends Coalescer<T> {
  setSaver(save: Saver<T>): void;
}

/** Guardado agrupado que refleja el resultado en los estados visibles (diseño §4.1). */
function createAutosave<T>(): Autosave<T> {
  let saver: Saver<T> = () => Promise.reject(new Error('Guardado no configurado'));
  const inner = createCoalescer<T>(async (value) => {
    const { setSaveStatus, upsertDocument } = useUiStore.getState();
    try {
      const result = await saver(value);
      upsertDocument(result.document);
      setSaveStatus(result.status === 'conflict' ? 'conflict' : 'saved-local');
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'unknown';
      // Ante un fallo nunca se muestra «Guardado en este dispositivo».
      setSaveStatus(code === 'quota-exceeded' ? 'out-of-space' : 'error', code);
      console.error('Guardado local fallido', error);
      logDiagnostic('error', 'save-failed', describeError(error));
      throw error;
    }
  });
  return {
    setSaver(save) {
      saver = save;
    },
    push(value) {
      useUiStore.getState().setSaveStatus('pending-changes');
      inner.push(value);
    },
    flush: () => inner.flush(),
    cancel: () => inner.cancel(),
    get pending() {
      return inner.pending;
    },
  };
}

/**
 * Guardado automático (diseño §7.1): espera 500 ms, máximo 2 s en edición continua, y guardado
 * forzado al ocultar la página, al terminar un trazo y antes de cambiar de documento.
 * «Guardado en este dispositivo» solo se muestra cuando la transacción se completó.
 */
export function useAutosave<T>(save: Saver<T>): Coalescer<T> {
  const [autosave] = useState(createAutosave<T>);
  useLayoutEffect(() => {
    autosave.setSaver(save);
  });

  useEffect(() => {
    const flush = () => void autosave.flush().catch(() => undefined);
    // visibilitychange complementa al guardado periódico; no se depende de beforeunload.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    // Antes de activar una versión nueva de la app se vacía este guardado (diseño §14.4).
    const unregister = registerFlusher(() => autosave.flush());
    return () => {
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      // Guardar antes de cambiar de documento.
      flush();
    };
  }, [autosave]);

  return autosave;
}
