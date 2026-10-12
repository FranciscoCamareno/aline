import type { Uuid } from '../domain/ids.ts';
import type {
  ContentRefs,
  DocumentKind,
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
  kind: DocumentKind;
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
}

/** Consultas locales que usa la interfaz. No forman parte del protocolo de sincronización. */
export interface VaultReader {
  getVault(): Promise<Vault>;
  getDeviceState(): Promise<DeviceState>;
  listDocuments(): Promise<DocumentRecord[]>;
  getDocument(documentId: Uuid): Promise<DocumentRecord | undefined>;
  getRevision(revisionId: Uuid): Promise<Revision | undefined>;
  getBlob(hash: string): Promise<StoredBlob | undefined>;
  /** Preferencias privadas de esta instalación (no viajan en copias ni sincronización). */
  getDevicePreference(key: string): Promise<unknown>;
  setDevicePreference(key: string, value: unknown): Promise<void>;
}
