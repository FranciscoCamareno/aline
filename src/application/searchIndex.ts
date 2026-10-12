import MiniSearch from 'minisearch';
import type { SearchDocument } from '../ports/KnowledgeStore.ts';

/**
 * Índice de búsqueda de texto completo (diseño §10.1, RF-26): un documento por nota o lienzo con
 * título, etiquetas y texto agregado; después se localiza el elemento del lienzo que coincide.
 * Normaliza mayúsculas y diacríticos para buscar, y conserva el texto original para mostrarlo.
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export interface SearchHit {
  documentId: string;
  kind: SearchDocument['kind'];
  title: string;
  score: number;
  /** Fragmento del texto original alrededor de la primera coincidencia. */
  snippet: string;
  /** Lienzos: elementos cuyo texto contiene algún término buscado. */
  elementIds: string[];
}

const TOKEN = /[\p{L}\p{N}]+/gu;

function terms(query: string): string[] {
  return [...normalizeForSearch(query).matchAll(TOKEN)].map((m) => m[0]);
}

/** Primer fragmento del texto original que contiene un término (comparando normalizado). */
function snippetFor(text: string, queryTerms: string[], radius = 60): string {
  const normalized = normalizeForSearch(text);
  let at = -1;
  for (const term of queryTerms) {
    const i = normalized.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, radius * 2);
  // La normalización NFD + sin marcas conserva la longitud por carácter base en la mayoría de
  // los textos latinos; se ajusta al límite del texto original por seguridad.
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export class SearchIndex {
  private readonly mini = new MiniSearch<SearchDocument>({
    idField: 'documentId',
    fields: ['title', 'tags', 'text'],
    storeFields: [],
    tokenize: (text) => [...text.matchAll(TOKEN)].map((m) => m[0]),
    processTerm: (term) => normalizeForSearch(term) || null,
    extractField: (doc, field) =>
      field === 'tags'
        ? doc.tags.join(' ')
        : String((doc as unknown as Record<string, unknown>)[field] ?? ''),
    searchOptions: {
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      boost: { title: 3, tags: 2 },
      combineWith: 'AND',
    },
  });
  private readonly docs = new Map<string, SearchDocument>();

  get size(): number {
    return this.docs.size;
  }

  replaceAll(documents: readonly SearchDocument[]): void {
    this.mini.removeAll();
    this.docs.clear();
    this.mini.addAll(documents);
    for (const d of documents) this.docs.set(d.documentId, d);
  }

  upsert(documents: readonly SearchDocument[]): void {
    for (const doc of documents) {
      if (this.docs.has(doc.documentId)) this.mini.replace(doc);
      else this.mini.add(doc);
      this.docs.set(doc.documentId, doc);
    }
  }

  remove(ids: readonly string[]): void {
    for (const id of ids) {
      if (!this.docs.has(id)) continue;
      this.mini.discard(id);
      this.docs.delete(id);
    }
  }

  search(query: string, limit = 50): SearchHit[] {
    const queryTerms = terms(query);
    if (!queryTerms.length) return [];
    return this.mini
      .search(query)
      .slice(0, limit)
      .map((result) => {
        const doc = this.docs.get(String(result.id))!;
        const elementIds = doc.elements
          .filter((e) => {
            const words = [...normalizeForSearch(e.text).matchAll(TOKEN)].map((m) => m[0]);
            return queryTerms.some((t) => words.some((w) => w.startsWith(t)));
          })
          .map((e) => e.elementId);
        return {
          documentId: doc.documentId,
          kind: doc.kind,
          title: doc.title,
          score: result.score,
          snippet: snippetFor(doc.text, queryTerms),
          elementIds,
        };
      });
  }
}
