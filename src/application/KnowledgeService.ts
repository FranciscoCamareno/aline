import { parseNoteMarkdown } from '../domain/frontmatter.ts';
import type { Uuid } from '../domain/ids.ts';
import type { DocumentRecord, Revision } from '../domain/revision.ts';
import { utf8Decode } from '../shared/hash.ts';
import type { KnowledgeStore, SearchDocument, StoredLink } from '../ports/KnowledgeStore.ts';
import type { VaultReader, VaultRepository } from '../ports/VaultRepository.ts';
import { extractCanvas, extractNote, titleKey } from './knowledge.ts';

export type LinkStatus = 'ok' | 'missing' | 'trashed' | 'unresolved' | 'ambiguous';

export interface ResolvedLink {
  link: StoredLink;
  source: DocumentRecord | null;
  target: DocumentRecord | null;
  status: LinkStatus;
}

/**
 * Enlaces, backlinks y documentos de búsqueda (diseño §10, RF-20 a RF-24, RN-10). Los enlaces
 * apuntan a UUID, así que renombrar no exige reescribir nada (RF-23); los [[Título]] importados
 * se resuelven al consultar, solo si el título es único (§5.1).
 */
export class KnowledgeService {
  private readonly repo: VaultReader & Pick<VaultRepository, 'getHeads'>;
  private readonly store: KnowledgeStore;

  constructor(repo: VaultReader & Pick<VaultRepository, 'getHeads'>, store: KnowledgeStore) {
    this.repo = repo;
    this.store = store;
  }

  /** Vuelve a derivar un documento. Devuelve su documento de búsqueda, o null si se retiró. */
  async reindex(documentId: Uuid): Promise<SearchDocument | null> {
    const doc = await this.repo.getDocument(documentId);
    if (!doc || doc.deleted || doc.kind === 'folder') {
      await this.store.removeDerived(documentId);
      return null;
    }
    const head = await this.newestHead(documentId);
    if (!head) return null;
    const text = async (hash: string | null) => {
      if (!hash) return null;
      const blob = await this.repo.getBlob(hash);
      return blob ? utf8Decode(blob.bytes) : null;
    };
    const extracted =
      doc.kind === 'note'
        ? extractNote(parseNoteMarkdown((await text(head.contentRefs.body)) ?? '').body)
        : extractCanvas(await text(head.contentRefs.body), await text(head.contentRefs.extensions));
    const search: SearchDocument = {
      documentId,
      revisionId: head.id,
      kind: doc.kind,
      title: doc.title,
      tags: doc.tags,
      text: extracted.text,
      elements: extracted.elements,
    };
    await this.store.replaceDerived(
      documentId,
      extracted.links.map((l) => ({ ...l, sourceDocumentId: documentId })),
      search,
    );
    return search;
  }

  /**
   * Pone al día los índices derivados: vuelve a indexar lo que cambió desde la última vez y
   * retira lo que ya no está activo. Informa del progreso (diseño §10.1: indexado visible).
   */
  async sync(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ changed: SearchDocument[]; removed: Uuid[] }> {
    const documents = (await this.repo.listDocuments()).filter(
      (d) => !d.deleted && d.kind !== 'folder',
    );
    const indexed = await this.store.indexedRevisions();
    const stale: Uuid[] = [];
    for (const doc of documents) {
      // Con una sola cabeza (lo normal) no hace falta leer revisiones; solo en conflictos.
      const newestId =
        doc.headRevisionIds.length === 1
          ? doc.headRevisionIds[0]
          : (await this.newestHead(doc.id))?.id;
      if (newestId && indexed.get(doc.id) !== newestId) stale.push(doc.id);
    }
    const active = new Set(documents.map((d) => d.id));
    const removed = [...indexed.keys()].filter((id) => !active.has(id));
    for (const id of removed) await this.store.removeDerived(id);
    const changed: SearchDocument[] = [];
    for (const [i, id] of stale.entries()) {
      const doc = await this.reindex(id);
      if (doc) changed.push(doc);
      onProgress?.(i + 1, stale.length);
    }
    return { changed, removed };
  }

  allSearchDocuments(): Promise<SearchDocument[]> {
    return this.store.allSearchDocuments();
  }

  /** Backlinks de un documento (RF-22): calculados desde los enlaces existentes, no editables. */
  async backlinks(documentId: Uuid): Promise<ResolvedLink[]> {
    const documents = await this.documentsById();
    const direct = await this.store.linksTo(documentId);
    const wiki = (await this.store.allLinks()).filter((l) => l.kind === 'wiki');
    const result: ResolvedLink[] = [];
    for (const link of [...direct, ...wiki]) {
      const resolved = this.resolve(link, documents);
      if (resolved.target?.id !== documentId || resolved.status !== 'ok') continue;
      if (!resolved.source || resolved.source.deleted) continue; // origen en papelera (§10)
      result.push(resolved);
    }
    return result;
  }

  async outgoing(documentId: Uuid): Promise<ResolvedLink[]> {
    const documents = await this.documentsById();
    return (await this.store.linksFrom(documentId)).map((l) => this.resolve(l, documents));
  }

  /** Enlaces rotos (RF-24, CA-08): destino inexistente, en la papelera, sin resolver o ambiguo. */
  async brokenLinks(): Promise<ResolvedLink[]> {
    const documents = await this.documentsById();
    return (await this.store.allLinks())
      .map((l) => this.resolve(l, documents))
      .filter((r) => r.status !== 'ok' && r.source && !r.source.deleted);
  }

  /** Resolución de un [[Título]]: único destino activo, o null/ambiguo (nunca se elige en silencio). */
  resolveTitle(
    label: string,
    documents: Iterable<DocumentRecord>,
  ): DocumentRecord | 'ambiguous' | null {
    const key = titleKey(label);
    const matches = [...documents].filter(
      (d) => !d.deleted && d.kind !== 'folder' && titleKey(d.title) === key,
    );
    if (matches.length > 1) return 'ambiguous';
    return matches[0] ?? null;
  }

  private resolve(link: StoredLink, documents: Map<Uuid, DocumentRecord>): ResolvedLink {
    const source = documents.get(link.sourceDocumentId) ?? null;
    if (link.kind === 'wiki') {
      const target = this.resolveTitle(link.label, documents.values());
      if (target === 'ambiguous') return { link, source, target: null, status: 'ambiguous' };
      return { link, source, target, status: target ? 'ok' : 'unresolved' };
    }
    const target = link.targetDocumentId ? (documents.get(link.targetDocumentId) ?? null) : null;
    const status: LinkStatus = !target ? 'missing' : target.deleted ? 'trashed' : 'ok';
    return { link, source, target, status };
  }

  private async documentsById(): Promise<Map<Uuid, DocumentRecord>> {
    return new Map((await this.repo.listDocuments()).map((d) => [d.id, d]));
  }

  private async newestHead(documentId: Uuid): Promise<Revision | undefined> {
    const heads = await this.repo.getHeads(documentId);
    return heads.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  }
}
