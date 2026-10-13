/** Errores de dominio y de almacenamiento con código estable para traducir en la UI. */
export type DomainErrorCode =
  | 'not-found'
  | 'invalid-title'
  | 'quota-exceeded'
  | 'storage-failure'
  | 'not-implemented'
  | 'unsupported-version'
  | 'invalid-content';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomainError';
    this.code = code;
  }
}

/** Marca explícita de funciones pendientes; nunca simula un éxito. */
export function notImplemented(feature: string): never {
  throw new DomainError('not-implemented', `Pendiente: ${feature}`);
}

export function validateTitle(title: string): string {
  const clean = title.normalize('NFC').trim();
  if (!clean) throw new DomainError('invalid-title', 'El título no puede estar vacío');
  if (clean.length > 300) throw new DomainError('invalid-title', 'El título es demasiado largo');
  return clean;
}
