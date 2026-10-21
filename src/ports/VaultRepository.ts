import type { Uuid } from '../domain/ids.ts';
import type {
  ContentRefs,
  RevisionKind,
  DocumentRecord,
  Revision,
  RevisionMetadata,
  RevisionOperation,
} from '../domain/revision.ts';
import type { DeviceState, Vault, VersionPrune } from '../domain/vault.ts';

/** Contenido direccionado por hash (diseño §5, entidad Asset). */
export interface StoredBlob {
  hash: string;
  mimeType: string;
  byteLength: number;
  bytes: Uint8Array;
}

export interface CommitInput {
  documentId: Uuid;
  kind: RevisionKind;
  operation: RevisionOperation;
  /** Cabezas conocidas al comenzar la edición; serán los parentIds de la nueva revisión. */
  knownHeads: Uuid[];
  metadata: RevisionMetadata;
  contentRefs: ContentRefs;
  /** Blobs con hash ya calculado fuera de la transacción. Insertarlos es idempotente. */
  blobs: StoredBlob[];
}

export type CommitResult =
  | { status: 'committed'; revision: Revision; document: DocumentRecord }
  /** Otra pestaña o dispositivo avanzó la cabeza: el cambio se conserva como rama. */
  | { status: 'conflict'; revision: Revision; document: DocumentRecord };

export interface ResolveInput {
  /** Revisión cuyo contenido se adopta; la resolución conserva todas las ramas en el historial. */
  keepRevisionId: Uuid;
}

/** Contenido completo de un almacén: lo que viaja en el formato abierto (diseño §6). */
export interface VaultContent {
  vault: Vault;
  documents: DocumentRecord[];
  revisions: Revision[];
  blobs: Map<string, StoredBlob>;
  controls: VersionPrune[];
}

/** Entrada del historial sin cargar cuerpos (diseño §7.2). */
export interface HistoryEntry {
  revisionId: Uuid;
  documentId: Uuid;
  createdAt: string;
  operation: RevisionOperation;
  title: string;
}

export interface PurgeResult {
  revisions: number;
  /** Bytes de blobs que dejaron de estar referenciados y se borraron. */
  freedBytes: number;
}

/** Espacio que ocupan las versiones de un documento (RF-46). */
export interface VersionSpace {
  /** Bytes de todos los objetos que usan sus versiones, contando una vez los compartidos. */
  totalBytes: number;
  /**
   * Por versión: bytes que se liberarían al eliminar solo esa versión (sus objetos que no usa
   * ninguna otra versión retenida, de este documento ni de otro).
   */
  freeableBytes: Record<Uuid, number>;
}

export interface VaultSnapshot {
  vault: Vault;
  documents: DocumentRecord[];
  revisions: Revision[];
  blobHashes: string[];
  controls: VersionPrune[];
}

/** Puerto de escritura del almacén (diseño §15). */
export interface VaultRepository {
  getHeads(documentId: Uuid): Promise<Revision[]>;
  commit(change: CommitInput): Promise<CommitResult>;
  resolve(documentId: Uuid, parents: Uuid[], choice: ResolveInput): Promise<Revision>;
  restore(documentId: Uuid, revisionId: Uuid): Promise<Revision>;
  exportSnapshot(): Promise<VaultSnapshot>;
  /** Generación coherente de todo el contenido, en una sola transacción de lectura (§12.2). */
  exportContent(): Promise<VaultContent>;
  /**
   * Borrado definitivo explícito de un documento en la papelera (RN-03): retira sus revisiones,
   * borra los blobs que ya nadie referencia y registra un control VersionPrune.
   */
  purgeDocument(documentId: Uuid): Promise<PurgeResult>;
  /**
   * Poda explícita de versiones de un documento vivo (RF-46, RN-13): retira esas revisiones (nunca
   * una cabeza), borra los blobs que ya nadie referencia y registra un control VersionPrune para
   * que la sincronización no las resucite.
   */
  pruneRevisions(documentId: Uuid, revisionIds: Uuid[]): Promise<PurgeResult>;
}

/** Consultas locales que usa la interfaz. No forman parte del protocolo de sincronización. */
export interface VaultReader {
  getVault(): Promise<Vault>;
  getDeviceState(): Promise<DeviceState>;
  listDocuments(): Promise<DocumentRecord[]>;
  getDocument(documentId: Uuid): Promise<DocumentRecord | undefined>;
  getRevision(revisionId: Uuid): Promise<Revision | undefined>;
  getBlob(hash: string): Promise<StoredBlob | undefined>;
  listHistory(documentId: Uuid): Promise<HistoryEntry[]>;
  versionSpace(documentId: Uuid): Promise<VersionSpace>;
  /** Preferencias privadas de esta instalación (no viajan en copias ni sincronización). */
  getDevicePreference(key: string): Promise<unknown>;
  setDevicePreference(key: string, value: unknown): Promise<void>;
}
