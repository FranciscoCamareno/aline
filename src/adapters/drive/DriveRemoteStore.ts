import { notImplemented } from '../../domain/errors.ts';
import type { DocumentRecord, Revision } from '../../domain/revision.ts';
import type { Vault, VersionPrune } from '../../domain/vault.ts';
import type { RemoteAuth } from '../../ports/RemoteAuth.ts';
import type {
  ReadableCopy,
  RemoteChangePage,
  RemoteObject,
  RemoteStore,
} from '../../ports/RemoteStore.ts';

/**
 * PENDIENTE — Adaptador Google Drive (diseño §8.2, §13, §14.3). Implementará el mismo contrato
 * que la carpeta local (adapters/filesystem/FolderRemoteStore.ts), con el que el motor de
 * sincronización ya está probado.
 *
 * Requisitos antes de implementarlo:
 * - Proyecto Google Cloud del propietario con Drive API y cliente OAuth web (aún no existe).
 * - Origen HTTPS estable de la PWA: https://aline.projeck.workers.dev (ya publicado).
 *
 * Reglas que debe cumplir:
 * - scope drive.file; GIS se carga solo tras elegir conectar y aceptar el aviso RN-12.
 * - appProperties con vaultId, documentId, revisionId, hash y operationId; mapeo de IDs de Drive.
 * - Objetos primero, revisión al final; nunca sobrescribir revisiones ni objetos.
 * - Paginación completa, feed de cambios con cursor, reconciliación si el cursor es inválido.
 * - Reintentos con backoff + jitter y Retry-After; 401 → «Necesita autorización» (RemoteError).
 * - Multipart para objetos pequeños; subida resumible para adjuntos grandes.
 */
export class DriveRemoteStore implements RemoteStore {
  private readonly auth: RemoteAuth;

  constructor(auth: RemoteAuth) {
    this.auth = auth;
  }

  async readVault(): Promise<Vault | null> {
    void this.auth; // Se usará para obtener el token en cada petición.
    return notImplemented('Drive: lectura del almacén');
  }

  async initializeVault(_vault: Vault): Promise<void> {
    return notImplemented('Drive: creación del almacén');
  }

  async pull(_cursor: string | null): Promise<RemoteChangePage> {
    return notImplemented('Drive: descarga de cambios');
  }

  async getRevision(_id: string): Promise<unknown> {
    return notImplemented('Drive: lectura de revisiones');
  }

  async getObject(_hash: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return notImplemented('Drive: descarga de objetos');
  }

  async putObject(_object: RemoteObject, _operationId: string): Promise<void> {
    return notImplemented('Drive: subida de objetos');
  }

  async publishRevision(_revision: Revision, _operationId: string): Promise<void> {
    return notImplemented('Drive: publicación de revisiones');
  }

  async publishControl(_control: VersionPrune): Promise<void> {
    return notImplemented('Drive: publicación de controles de poda');
  }

  async publishIndexes(
    _deviceId: string,
    _documents: DocumentRecord[],
    _vault: Vault,
  ): Promise<void> {
    return notImplemented('Drive: índices aceleradores');
  }

  async listReadableCopies(): Promise<ReadableCopy[]> {
    return notImplemented('Drive: copias legibles');
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
