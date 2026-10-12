import type { Uuid } from '../../domain/ids.ts';
import type { KnowledgeStore, SearchDocument, StoredLink } from '../../ports/KnowledgeStore.ts';
import type { VaultDatabase } from './db.ts';

const strip = ({ id: _id, ...link }: StoredLink & { id?: number }): StoredLink => link;

/** Índices derivados en las tablas linkIndex y searchDocuments del esquema v1. */
export class DexieKnowledgeStore implements KnowledgeStore {
  private readonly db: VaultDatabase;

  constructor(db: VaultDatabase) {
    this.db = db;
  }

  async indexedRevisions(): Promise<Map<Uuid, Uuid>> {
    const map = new Map<Uuid, Uuid>();
    // Recorre solo el índice (clave = revisionId, clave primaria = documentId): no carga textos.
    await this.db.searchDocuments.orderBy('revisionId').eachKey((revisionId, cursor) => {
      map.set(String(cursor.primaryKey), String(revisionId));
    });
    return map;
  }

  async replaceDerived(
    documentId: Uuid,
    links: StoredLink[],
    search: SearchDocument,
  ): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.linkIndex, db.searchDocuments, async () => {
      await db.linkIndex.where({ sourceDocumentId: documentId }).delete();
      await db.linkIndex.bulkAdd(links);
      await db.searchDocuments.put(search);
    });
  }

  async removeDerived(documentId: Uuid): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.linkIndex, db.searchDocuments, async () => {
      await db.linkIndex.where({ sourceDocumentId: documentId }).delete();
      await db.searchDocuments.delete(documentId);
    });
  }

  async linksTo(documentId: Uuid): Promise<StoredLink[]> {
    return (await this.db.linkIndex.where({ targetDocumentId: documentId }).toArray()).map(strip);
  }

  async linksFrom(documentId: Uuid): Promise<StoredLink[]> {
    return (await this.db.linkIndex.where({ sourceDocumentId: documentId }).toArray()).map(strip);
  }

  async allLinks(): Promise<StoredLink[]> {
    return (await this.db.linkIndex.toArray()).map(strip);
  }

  allSearchDocuments(): Promise<SearchDocument[]> {
    return this.db.searchDocuments.toArray();
  }

  getSearchDocument(documentId: Uuid): Promise<SearchDocument | undefined> {
    return this.db.searchDocuments.get(documentId);
  }
}
