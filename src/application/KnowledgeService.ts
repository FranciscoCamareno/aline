import { resolveAnchor } from '../domain/anchors.ts';
import { parseNoteMarkdown } from '../domain/frontmatter.ts';
import type { Uuid } from '../domain/ids.ts';
import {
  isIndexedKind,
  isMarkdownKind,
  type DocumentRecord,
  type Revision,
} from '../domain/revision.ts';
import { utf8Decode } from '../shared/hash.ts';
import type { KnowledgeStore, SearchDocument, StoredLink } from '../ports/KnowledgeStore.ts';
import type { VaultReader, VaultRepository } from '../ports/VaultRepository.ts';
import {
  extractCalendar,
  extractCanvas,
  extractNote,
  extractRichDoc,
  titleKey,
  type Extracted,
} from './knowledge.ts';

/**
 * `approximate`: el bloque enlazado sigue, pero la cita ya no está en él ni en el documento.
 * `anchor-lost`: ni la cita ni el bloque (o el evento) siguen en el destino.
 */
export type LinkStatus =
  'ok' | 'approximate' | 'anchor-lost' | 'missing' | 'trashed' | 'unresolved' | 'ambiguous';

/** El enlace llega a su documento (aunque su fragmento haya cambiado o ya no esté). */
export function reachesTarget(status: LinkStatus): boolean {
  return status === 'ok' || status === 'approximate' || status === 'anchor-lost';
}

/**
 * Formato de los índices derivados. 2 (16/10/2026): documentos con formato y calendarios,
 * anclas de destino y contexto en los enlaces, texto mostrado en notas y documentos.
 */
export const KNOWLEDGE_INDEX_FORMAT = 2;

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
    // Todo lo enlazable tiene enlaces y texto indexable (no carpetas ni plantillas).
    if (!doc || doc.deleted || !isIndexedKind(doc.kind)) {
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
    const body = await text(head.contentRefs.body);
    let extracted: Extracted;
    if (isMarkdownKind(doc.kind)) extracted = extractNote(parseNoteMarkdown(body ?? '').body);
    else if (doc.kind === 'doc') extracted = extractRichDoc(body);
    else if (doc.kind === 'calendar') extracted = extractCalendar(body);
    else extracted = extractCanvas(body, await text(head.contentRefs.extensions));
    const search: SearchDocument = {
      documentId,
      revisionId: head.id,
      kind: doc.kind,
      title: doc.title,
      tags: doc.tags,
      text: extracted.text,
      elements: extracted.elements,
      ...(extracted.blocks ? { blocks: extracted.blocks } : {}),
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
      (d) => !d.deleted && isIndexedKind(d.kind),
    );
    // Índices de un formato anterior: se reconstruyen todos.
    const current = (await this.store.indexFormat()) === KNOWLEDGE_INDEX_FORMAT;
    const indexed = await this.store.indexedRevisions();
    const stale: Uuid[] = [];
    for (const doc of documents) {
      // Con una sola cabeza (lo normal) no hace falta leer revisiones; solo en conflictos.
      const newestId =
        doc.headRevisionIds.length === 1
          ? doc.headRevisionIds[0]
          : (await this.newestHead(doc.id))?.id;
      if (newestId && (!current || indexed.get(doc.id) !== newestId)) stale.push(doc.id);
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
    if (!current) await this.store.setIndexFormat(KNOWLEDGE_INDEX_FORMAT);
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
    const all = [...direct, ...wiki];
    const anchors = await this.anchorTargets(all);
    for (const link of all) {
      const resolved = this.resolve(link, documents, anchors);
      if (resolved.target?.id !== documentId || !reachesTarget(resolved.status)) continue;
      if (!resolved.source || resolved.source.deleted) continue; // origen en papelera (§10)
      result.push(resolved);
    }
    return result;
  }

  async outgoing(documentId: Uuid): Promise<ResolvedLink[]> {
    const documents = await this.documentsById();
    const links = await this.store.linksFrom(documentId);
    const anchors = await this.anchorTargets(links);
    return links.map((l) => this.resolve(l, documents, anchors));
  }

  /**
   * Enlaces rotos (RF-24, CA-08): destino inexistente, en la papelera, sin resolver o ambiguo, o
   * con el fragmento perdido. Un ancla aproximada (sigue el bloque) no cuenta como rota.
   */
  async brokenLinks(): Promise<ResolvedLink[]> {
    const documents = await this.documentsById();
    const links = await this.store.allLinks();
    const anchors = await this.anchorTargets(links);
    return links
      .map((l) => this.resolve(l, documents, anchors))
      .filter(
        (r) => r.status !== 'ok' && r.status !== 'approximate' && r.source && !r.source.deleted,
      );
  }

  /** Resolución de un [[Título]]: único destino activo, o null/ambiguo (nunca se elige en silencio). */
  resolveTitle(
    label: string,
    documents: Iterable<DocumentRecord>,
  ): DocumentRecord | 'ambiguous' | null {
    const key = titleKey(label);
    const matches = [...documents].filter(
      (d) => !d.deleted && isIndexedKind(d.kind) && titleKey(d.title) === key,
    );
    if (matches.length > 1) return 'ambiguous';
    return matches[0] ?? null;
  }

  /** Documentos de búsqueda de los destinos con ancla: su texto indexado resuelve las citas. */
  private async anchorTargets(links: StoredLink[]): Promise<Map<Uuid, SearchDocument>> {
    const ids = new Set(
      links
        .filter((l) => l.targetDocumentId && (l.targetBlockId || l.targetQuote || l.targetEventId))
        .map((l) => l.targetDocumentId!),
    );
    const found = new Map<Uuid, SearchDocument>();
    for (const id of ids) {
      const doc = await this.store.getSearchDocument(id);
      if (doc) found.set(id, doc);
    }
    return found;
  }

  /** Estado del ancla de un enlace cuyo documento existe. */
  private anchorStatus(link: StoredLink, target: SearchDocument | undefined): LinkStatus {
    // Destino aún sin indexar: no se puede saber; se da por bueno.
    if (!target) return 'ok';
    if (link.targetEventId && !target.elements.some((e) => e.elementId === link.targetEventId)) {
      return 'anchor-lost';
    }
    const result = resolveAnchor(
      { text: target.text, blocks: target.blocks ?? [], segments: [] },
      { blockId: link.targetBlockId ?? null, text: link.targetQuote ?? null },
    );
    if (!result || result.status === 'found') return 'ok';
    return result.status === 'approximate' ? 'approximate' : 'anchor-lost';
  }

  private resolve(
    link: StoredLink,
    documents: Map<Uuid, DocumentRecord>,
    anchors: Map<Uuid, SearchDocument> = new Map(),
  ): ResolvedLink {
    const source = documents.get(link.sourceDocumentId) ?? null;
    if (link.kind === 'wiki') {
      const target = this.resolveTitle(link.label, documents.values());
      if (target === 'ambiguous') return { link, source, target: null, status: 'ambiguous' };
      return { link, source, target, status: target ? 'ok' : 'unresolved' };
    }
    const target = link.targetDocumentId ? (documents.get(link.targetDocumentId) ?? null) : null;
    const status: LinkStatus = !target
      ? 'missing'
      : target.deleted
        ? 'trashed'
        : this.anchorStatus(link, anchors.get(target.id));
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
