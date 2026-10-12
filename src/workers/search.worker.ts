/** Worker de búsqueda (diseño §10.1): el índice MiniSearch vive fuera del hilo de la interfaz. */
import { VaultDatabase } from '../adapters/indexeddb/db.ts';
import { SearchIndex, type SearchHit } from '../application/searchIndex.ts';
import type { SearchDocument } from '../ports/KnowledgeStore.ts';

export type SearchRequest =
  | { id: number; op: 'reset'; docs: SearchDocument[] }
  /** Carga el índice leyendo la base del almacén desde el propio worker (sin pasar por la UI). */
  | { id: number; op: 'load'; dbName: string }
  | { id: number; op: 'upsert'; docs: SearchDocument[] }
  | { id: number; op: 'remove'; ids: string[] }
  | { id: number; op: 'search'; query: string; limit?: number };

export type SearchResponse =
  | { id: number; ok: true; hits?: SearchHit[]; ms: number; size: number }
  | { id: number; ok: false; error: string };

const index = new SearchIndex();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SearchRequest>) => void) | null;
  postMessage(message: SearchResponse): void;
};

async function loadFromDatabase(dbName: string): Promise<void> {
  const db = new VaultDatabase(dbName);
  try {
    index.replaceAll(await db.searchDocuments.toArray());
  } finally {
    db.close();
  }
}

scope.onmessage = (event) => {
  const req = event.data;
  const start = performance.now();
  if (req.op === 'load') {
    loadFromDatabase(req.dbName).then(
      () =>
        scope.postMessage({
          id: req.id,
          ok: true,
          ms: performance.now() - start,
          size: index.size,
        }),
      (error: unknown) =>
        scope.postMessage({
          id: req.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return;
  }
  try {
    let hits: SearchHit[] | undefined;
    if (req.op === 'reset') index.replaceAll(req.docs);
    else if (req.op === 'upsert') index.upsert(req.docs);
    else if (req.op === 'remove') index.remove(req.ids);
    else hits = index.search(req.query, req.limit);
    scope.postMessage({
      id: req.id,
      ok: true,
      ...(hits ? { hits } : {}),
      ms: performance.now() - start,
      size: index.size,
    });
  } catch (error) {
    scope.postMessage({
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
