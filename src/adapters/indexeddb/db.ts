import { Dexie, type EntityTable } from 'dexie';
import type { DocumentRecord, Revision } from '../../domain/revision.ts';
import type { VersionPrune } from '../../domain/vault.ts';
import type { SearchDocument, StoredLink } from '../../ports/KnowledgeStore.ts';
import type { StoredBlob } from '../../ports/VaultRepository.ts';

/** Operación pendiente de enviar a la carpeta o a Drive (diseño §4, cola persistente). */
export interface OutboxEntry {
  /** operationId persistente para deduplicar reintentos (diseño §8.2). */
  id: string;
  type: 'revision';
  revisionId: string;
  documentId: string;
  createdAt: string;
}

export interface HistoryIndexEntry {
  revisionId: string;
  documentId: string;
  createdAt: string;
  operation: Revision['operation'];
  title: string;
}

export interface DeviceSettingEntry {
  key: string;
  value: unknown;
}

export interface DiagnosticEntry {
  id?: number;
  at: string;
  level: 'info' | 'warn' | 'error';
  /** Código estable del suceso, p. ej. «save-failed» o «uncaught-error». */
  code: string;
  /** Nunca contenido de notas ni tokens (diseño §13). */
  message: string;
}

// Tablas reservadas para funciones pendientes; se declaran ya para no requerir migración.
export interface RemoteFileEntry {
  key: string;
  remoteId: string;
}
export interface IncomingStagingEntry {
  id: string;
  payload: unknown;
}
export interface ExternalObservationEntry {
  path: string;
  hash: string;
  observedAt: string;
}
/** Índices derivados (diseño §6): enlaces y documentos de búsqueda, reconstruibles. */
export interface LinkIndexEntry extends StoredLink {
  id?: number;
}
export type SearchDocumentEntry = SearchDocument;

export const DB_NAME = 'mindnote-vault';

/** Esquema IndexedDB (diseño §6). Los índices de enlaces, búsqueda e historial son reconstruibles. */
export class VaultDatabase extends Dexie {
  documents!: EntityTable<DocumentRecord, 'id'>;
  revisions!: EntityTable<Revision, 'id'>;
  blobs!: EntityTable<StoredBlob, 'hash'>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  remoteFiles!: EntityTable<RemoteFileEntry, 'key'>;
  incomingStaging!: EntityTable<IncomingStagingEntry, 'id'>;
  externalObservations!: EntityTable<ExternalObservationEntry, 'path'>;
  linkIndex!: EntityTable<LinkIndexEntry, 'id'>;
  searchDocuments!: EntityTable<SearchDocumentEntry, 'documentId'>;
  historyIndex!: EntityTable<HistoryIndexEntry, 'revisionId'>;
  controls!: EntityTable<VersionPrune, 'id'>;
  deviceSettings!: EntityTable<DeviceSettingEntry, 'key'>;
  diagnostics!: EntityTable<DiagnosticEntry, 'id'>;

  /**
   * `indexedDB` permite inyectar otra implementación: el almacén temporal en memoria (FA-01b)
   * usa fake-indexeddb cuando el navegador no deja abrir IndexedDB.
   */
  constructor(
    name: string = DB_NAME,
    indexedDB?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange },
  ) {
    super(name, indexedDB);
    this.version(1).stores({
      documents: 'id, kind, updatedAt, deleted, folderId',
      revisions: 'id, documentId, createdAt',
      blobs: 'hash',
      outbox: 'id, createdAt',
      remoteFiles: 'key',
      incomingStaging: 'id',
      externalObservations: 'path',
      linkIndex: '++id, sourceDocumentId, targetDocumentId',
      searchDocuments: 'documentId',
      historyIndex: 'revisionId, documentId, createdAt',
      controls: 'id',
      deviceSettings: 'key',
      diagnostics: '++id, at',
    });
    // v2: índice de revisión en los documentos de búsqueda, para saber qué está al día sin leer
    // sus textos. Solo afecta a una tabla derivada; no cambia el formato del almacén.
    this.version(2).stores({ searchDocuments: 'documentId, revisionId' });
  }
}
