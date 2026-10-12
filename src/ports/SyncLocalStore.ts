import type { Uuid } from '../domain/ids.ts';
import type { DocumentRecord, Revision } from '../domain/revision.ts';
import type { VersionPrune } from '../domain/vault.ts';
import type { StoredBlob } from './VaultRepository.ts';

/** Estado de sincronización de un destino (carpeta o Drive) en este dispositivo. */
export interface SyncState {
  cursor: string | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
}

/** Última observación de una copia legible (diseño §8.3: comparar hashes, no reimportar). */
export interface Observation {
  hash: string;
  lastModified: number;
  /** Revisión creada al importar la última edición externa; padre de la siguiente. */
  revisionId?: string;
}

/**
 * Lado local del protocolo de sincronización (diseño §8). Lo implementa el repositorio de
 * IndexedDB; todas las escrituras son transaccionales y nunca sobrescriben revisiones.
 */
export interface SyncLocalStore {
  hasRevision(id: Uuid): Promise<boolean>;
  hasBlob(hash: string): Promise<boolean>;
  /**
   * Activa revisiones remotas ya verificadas (objetos presentes y hashes correctos) en una sola
   * transacción y recalcula las cabezas de cada documento afectado a partir de parentIds.
   * Dos ramas sin relación de ascendencia quedan como dos cabezas: conflicto visible.
   */
  applyRemote(revisions: Revision[], blobs: StoredBlob[]): Promise<DocumentRecord[]>;
  /**
   * Aplica órdenes de retirada de versiones llegadas de otro equipo antes de subir nada, para
   * no resucitar versiones eliminadas. Nunca retira una cabeza viva.
   */
  applyControls(controls: VersionPrune[]): Promise<number>;
  /** Controles locales (p. ej. borrados definitivos hechos aquí) para publicarlos. */
  listControls(): Promise<VersionPrune[]>;
  /** Revisiones locales que aún no constan como publicadas en el destino. */
  unpublishedRevisions(target: string): Promise<Revision[]>;
  isPublished(target: string, kind: 'rev' | 'obj', id: string): Promise<boolean>;
  markPublished(target: string, kind: 'rev' | 'obj', ids: string[]): Promise<void>;
  /** Retira de la cola de salida las operaciones ya publicadas. */
  clearOutbox(revisionIds: Uuid[]): Promise<void>;
  getSyncState(target: string): Promise<SyncState>;
  setSyncState(target: string, state: SyncState): Promise<void>;
  getObservation(target: string, path: string): Promise<Observation | undefined>;
  setObservation(target: string, path: string, observation: Observation): Promise<void>;
}
