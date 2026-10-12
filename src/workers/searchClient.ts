import type { SearchHit } from '../application/searchIndex.ts';
import type { SearchDocument } from '../ports/KnowledgeStore.ts';
import type { SearchRequest, SearchResponse } from './search.worker.ts';

type Command = SearchRequest extends infer R
  ? R extends SearchRequest
    ? Omit<R, 'id'>
    : never
  : never;

export interface SearchClient {
  reset(docs: SearchDocument[]): Promise<void>;
  /** El worker lee los documentos de búsqueda de la base del almacén. */
  load(dbName: string): Promise<void>;
  upsert(docs: SearchDocument[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  /** Resultados y milisegundos que tardó la consulta dentro del worker. */
  search(query: string, limit?: number): Promise<{ hits: SearchHit[]; ms: number }>;
  terminate(): void;
}

/** Cliente del worker de búsqueda; las peticiones se atienden en orden. */
export function createSearchClient(): SearchClient {
  const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (r: SearchResponse) => void; reject: (e: Error) => void }
  >();
  worker.onmessage = (event: MessageEvent<SearchResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    entry.resolve(event.data);
  };
  worker.onerror = (event) => {
    for (const p of pending.values())
      p.reject(new Error(event.message || 'El worker de búsqueda falló'));
    pending.clear();
  };

  const send = (command: Command) =>
    new Promise<SearchResponse>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...command, id } as SearchRequest);
    }).then((res) => {
      if (!res.ok) throw new Error(res.error);
      return res;
    });

  return {
    reset: async (docs) => void (await send({ op: 'reset', docs })),
    load: async (dbName) => void (await send({ op: 'load', dbName })),
    upsert: async (docs) => void (await send({ op: 'upsert', docs })),
    remove: async (ids) => void (await send({ op: 'remove', ids })),
    async search(query, limit) {
      const res = await send({ op: 'search', query, ...(limit ? { limit } : {}) });
      return { hits: res.ok ? (res.hits ?? []) : [], ms: res.ok ? res.ms : 0 };
    },
    terminate: () => worker.terminate(),
  };
}
