import { logDiagnostic } from '../../app/runtime.ts';
import type { RemoteProblem } from '../../app/syncRuntime.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import { RemoteError } from '../../ports/RemoteStore.ts';

/** Clave de traducción de un fallo de sincronización (plan 9.2): los adaptadores dan códigos. */
export function syncErrorKey(problem: RemoteProblem): string {
  return `storage.errors.${problem}`;
}

/**
 * Causa de un error lanzado al conectar, autorizar o desbloquear. Lo que no viene de un destino
 * remoto se muestra como `unknown` y su detalle técnico queda en el diagnóstico.
 */
export function problemOf(error: unknown): RemoteProblem {
  if (error instanceof RemoteError) return error.code;
  logDiagnostic('error', 'sync-action-failed', describeError(error));
  return 'unknown';
}
