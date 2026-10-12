import type { Revision } from '../domain/revision.ts';
import type { Vault, VersionPrune } from '../domain/vault.ts';
import type { DocumentRecord } from '../domain/revision.ts';

/**
 * Contrato de un almacén remoto (diseño §8 y §15). Lo implementan la carpeta local
 * (adapters/filesystem) y Google Drive (adapters/drive, pendiente). Representa el formato
 * abierto del §6: objetos y revisiones inmutables, escritos objetos primero y revisión al final.
 */
export interface RemoteChangePage {
  /** Revisiones aparecidas desde el cursor (solo identificadores: se leen bajo demanda). */
  revisionIds: string[];
  controls: VersionPrune[];
  nextCursor: string;
  /** true cuando no quedan más páginas en esta consulta. */
  complete: boolean;
}

/** Papel de un objeto en el formato abierto; decide su ruta y extensión. */
export type ObjectRole = 'note' | 'canvas' | 'extensions' | 'asset';

export interface RemoteObject {
  hash: string;
  role: ObjectRole;
  mimeType: string;
  bytes: Uint8Array;
}

/** Copia legible y editable de una versión de nota (diseño §8.3). */
export interface ReadableCopy {
  documentId: string;
  revisionId: string;
  path: string;
  /** Marca de modificación del archivo; sirve para no volver a leer lo que no cambió. */
  lastModified: number;
  read(): Promise<Uint8Array>;
}

export interface RemoteStore {
  /** Identidad del almacén guardado allí (vault.json), o null si está vacío. */
  readVault(): Promise<Vault | null>;
  /** Crea vault.json y el README si no existen; nunca sobrescribe otro almacén. */
  initializeVault(vault: Vault): Promise<void>;
  pull(cursor: string | null): Promise<RemoteChangePage>;
  /** Lee una revisión; null si no existe o no es JSON. La validación la hace el motor. */
  getRevision(id: string): Promise<unknown>;
  /** Bytes y tipo MIME del objeto; null si no existe (todavía) en el remoto. */
  getObject(hash: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  /** Idempotente: un objeto con el mismo hash ya presente no se vuelve a escribir. */
  putObject(object: RemoteObject, operationId: string): Promise<void>;
  /** Idempotente por id de revisión; las notas publican además su copia legible. */
  publishRevision(revision: Revision, operationId: string): Promise<void>;
  publishControl(control: VersionPrune): Promise<void>;
  /** Índices aceleradores (heads/<dispositivo>.json y catalog.json); nunca son autoridad. */
  publishIndexes(deviceId: string, documents: DocumentRecord[], vault: Vault): Promise<void>;
  /** Copias legibles existentes, para detectar ediciones hechas fuera de la aplicación. */
  listReadableCopies(): Promise<ReadableCopy[]>;
}

/** Fallo de un almacén remoto, clasificado para decidir reintento y estado visible (§8.2). */
export class RemoteError extends Error {
  readonly kind: 'permission' | 'offline' | 'quota' | 'transient' | 'not-found' | 'auth';
  /** Segundos sugeridos por el servidor (Retry-After). */
  readonly retryAfter: number | null;

  constructor(kind: RemoteError['kind'], message: string, retryAfter: number | null = null) {
    super(message);
    this.name = 'RemoteError';
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

/** Estados visibles de guardado y sincronización (diseño §4.1). */
export type PersistenceStatus =
  | 'pending-changes'
  | 'saved-local'
  | 'pending-folder'
  | 'pending-sync'
  | 'synced'
  | 'needs-auth'
  | 'conflict'
  | 'out-of-space'
  | 'error';

export interface SyncCycleResult {
  pulledRevisions: number;
  pushedRevisions: number;
  /** Documentos que cambiaron por revisiones llegadas del almacén remoto. */
  changedDocuments: string[];
  /** Documentos que quedaron con varias cabezas tras el ciclo. */
  conflicts: string[];
  /** Revisiones remotas no activadas (objetos ausentes o alterados, esquema inválido). */
  rejected: Array<{ revisionId: string; reason: string }>;
  /** Ediciones externas importadas de las copias legibles. */
  externalEdits: number;
}

/** Contrato del sincronizador (diseño §8.2). */
export interface SyncEngine {
  /** Ejecuta un ciclo: controles, descarga a staging, activación, subida y verificación. */
  runCycle(): Promise<SyncCycleResult>;
  /** Revisiones locales todavía no publicadas en el almacén remoto. */
  pendingCount(): Promise<number>;
  /** Hora de la última consulta entrante completada. */
  lastPullAt(): Promise<string | null>;
}
