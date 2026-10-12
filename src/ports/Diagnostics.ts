/**
 * Registro local de diagnóstico (RNF-13, diseño §13). Sin envío externo, sin contenido de
 * notas ni tokens. Rotado por tamaño: no afecta al historial de documentos.
 */
export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticRecord {
  at: string;
  level: DiagnosticLevel;
  code: string;
  message: string;
}

export interface Diagnostics {
  record(level: DiagnosticLevel, code: string, message: string): void;
  list(limit?: number): Promise<DiagnosticRecord[]>;
}

/** Texto seguro para el registro: nombre y mensaje del error, nunca valores arbitrarios. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? ` [${error.code}]` : '';
    return `${error.name}${code}: ${error.message}`;
  }
  return typeof error === 'string' ? error : 'Error no estándar';
}
