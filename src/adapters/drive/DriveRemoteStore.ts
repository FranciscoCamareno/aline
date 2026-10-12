import { notImplemented } from '../../domain/errors.ts';
import type { Revision } from '../../domain/revision.ts';
import type { VersionPrune } from '../../domain/vault.ts';
import type { RemoteAuth } from '../../ports/RemoteAuth.ts';
import type { RemoteChangePage, RemoteStore } from '../../ports/RemoteStore.ts';

/**
 * PENDIENTE — Adaptador Google Drive (diseño §8.2, §13, §14.3).
 *
 * Requisitos antes de implementarlo:
 * - Proyecto Google Cloud del propietario con Drive API y cliente OAuth web (aún no existe).
 * - Origen HTTPS estable de la PWA (aún no hay alojamiento).
 *
 * Reglas que debe cumplir:
 * - scope drive.file; GIS se carga solo tras elegir conectar y aceptar el aviso RN-12.
 * - appProperties con vaultId, documentId, revisionId, hash y operationId; mapeo de IDs de Drive.
 * - Objetos primero, revisión al final; nunca sobrescribir revisiones ni objetos.
 * - Paginación completa, feed de cambios con cursor, reconciliación si el cursor es inválido.
 * - Reintentos con backoff + jitter y Retry-After; 401 → «Necesita autorización».
 * - Multipart para objetos pequeños; subida resumible para adjuntos grandes.
 */
export class DriveRemoteStore implements RemoteStore {
  private readonly auth: RemoteAuth;

  constructor(auth: RemoteAuth) {
    this.auth = auth;
  }

  async pull(_cursor: string | null): Promise<RemoteChangePage> {
    void this.auth; // Se usará para obtener el token en cada petición.
    return notImplemented('Drive: descarga de cambios');
  }

  async getObject(_hash: string): Promise<Uint8Array> {
    return notImplemented('Drive: descarga de objetos');
  }

  async putObject(_hash: string, _bytes: Uint8Array, _operationId: string): Promise<void> {
    return notImplemented('Drive: subida de objetos');
  }

  async publishRevision(_revision: Revision, _operationId: string): Promise<void> {
    return notImplemented('Drive: publicación de revisiones');
  }

  async publishControl(_control: VersionPrune): Promise<void> {
    return notImplemented('Drive: publicación de controles de poda');
  }
}

/** Configuración pública (las variables VITE_ se incrustan en la compilación; nunca secretos). */
export function driveConfig(): { clientId: string | null; pickerApiKey: string | null } {
  const env = import.meta.env;
  return {
    clientId: (env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) || null,
    pickerApiKey: (env['VITE_GOOGLE_PICKER_API_KEY'] as string | undefined) || null,
  };
}
