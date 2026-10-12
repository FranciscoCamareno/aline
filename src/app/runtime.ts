import type { DiagnosticLevel, Diagnostics } from '../ports/Diagnostics.ts';

/**
 * Enlaces de proceso que no encajan en React: el registro de diagnóstico vigente y los
 * guardados pendientes que hay que vaciar antes de actualizar la aplicación (diseño §14.4).
 */
let diagnostics: Diagnostics | null = null;
const flushers = new Set<() => Promise<void>>();

export function setDiagnostics(next: Diagnostics | null): void {
  diagnostics = next;
}

export function logDiagnostic(level: DiagnosticLevel, code: string, message: string): void {
  diagnostics?.record(level, code, message);
}

export function registerFlusher(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/** Guarda todo lo pendiente; si algún guardado falla, la promesa se rechaza. */
export async function flushAllWrites(): Promise<void> {
  await Promise.all([...flushers].map((flush) => flush()));
}
