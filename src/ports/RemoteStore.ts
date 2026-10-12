import type { Revision } from '../domain/revision.ts';
import type { VersionPrune } from '../domain/vault.ts';

/**
 * Contrato del almacén remoto (diseño §8 y §15). PENDIENTE: no hay implementación real.
 * El adaptador de Drive (adapters/drive) lo implementará con fetch + GIS + Drive API v3.
 */
export interface RemoteChangePage {
  revisions: Revision[];
  controls: VersionPrune[];
  /** Hashes de objetos disponibles en remoto para descargar a staging. */
  objectHashes: string[];
  nextCursor: string;
  /** true cuando no quedan más páginas en esta consulta. */
  complete: boolean;
}

export interface RemoteStore {
  pull(cursor: string | null): Promise<RemoteChangePage>;
  getObject(hash: string): Promise<Uint8Array>;
  putObject(hash: string, bytes: Uint8Array, operationId: string): Promise<void>;
  publishRevision(revision: Revision, operationId: string): Promise<void>;
  publishControl(control: VersionPrune): Promise<void>;
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

/** Contrato del sincronizador (diseño §8.2). PENDIENTE. */
export interface SyncEngine {
  /** Ejecuta un ciclo: controles de poda, descarga a staging, activación, subida y verificación. */
  runCycle(): Promise<SyncCycleResult>;
  status(): PersistenceStatus;
  /** Hora de la última consulta entrante completada, para mostrar junto a «Sincronizado». */
  lastPullAt(): string | null;
}

export interface SyncCycleResult {
  pulledRevisions: number;
  pushedRevisions: number;
  conflicts: string[];
}
