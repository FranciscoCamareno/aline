import type { SearchHit } from '../application/searchIndex.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { createSearchClient, type SearchClient } from '../workers/searchClient.ts';
import { logDiagnostic } from './runtime.ts';
import type { AppServices } from './services.ts';
import { useUiStore } from './store.ts';

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 300);
  });
}

/** Espera tras un guardado antes de volver a indexar el documento (agrupa ráfagas de cambios). */
const REINDEX_DELAY_MS = 600;

/**
 * Mantiene al día los índices derivados y el índice de búsqueda del worker (diseño §10):
 * indexado inicial con progreso visible y, después, solo los documentos que cambian.
 */
export class KnowledgeRuntime {
  private readonly services: AppServices;
  private readonly client: SearchClient | null;
  private readonly queue = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready: Promise<void> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  /** Reindexación en curso (o la última); las siguientes se encadenan detrás. */
  private flushing: Promise<void> = Promise.resolve();

  constructor(services: AppServices) {
    this.services = services;
    this.client = typeof Worker === 'undefined' ? null : createSearchClient();
  }

  start(): void {
    const { setIndexing, bumpKnowledge } = useUiStore.getState();
    setIndexing({ done: 0, total: 0 });
    this.ready = (async () => {
      // Primero se pinta la interfaz; el indexado inicial va después (diseño §10.1: progreso
      // visible, sin prometer búsqueda completa antes de terminar).
      await idle();
      const started = performance.now();
      await this.services.knowledge.sync((done, total) => setIndexing({ done, total }));
      if (this.client && this.services.dbName) {
        await this.client.load(this.services.dbName);
      } else {
        // Almacén temporal (IndexedDB en memoria del hilo principal): se envían los documentos.
        await this.client?.reset(await this.services.knowledge.allSearchDocuments());
      }
      logDiagnostic('info', 'search-indexed', `ms=${Math.round(performance.now() - started)}`);
    })()
      .catch((error: unknown) => logDiagnostic('error', 'index-failed', describeError(error)))
      .finally(() => {
        setIndexing(null);
        bumpKnowledge();
      });
    this.unsubscribe = this.services.service.onCommit((result) =>
      this.schedule(result.document.id),
    );
  }

  /** Programa volver a indexar un documento (guardado local o aviso de otra pestaña). */
  schedule(documentId: string): void {
    this.queue.add(documentId);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), REINDEX_DELAY_MS);
  }

  /**
   * Indexa ya lo pendiente; las pruebas y la paleta de búsqueda pueden esperar a esto. Las
   * reindexaciones van en fila: quien espera también espera a la que ya estaba en curso (si no,
   * una búsqueda justo después de un guardado podía ver el índice anterior).
   */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flushing = this.flushing.then(() => this.flushNow());
    return this.flushing;
  }

  private async flushNow(): Promise<void> {
    await this.ready;
    const ids = [...this.queue];
    this.queue.clear();
    if (!ids.length) return;
    try {
      for (const id of ids) {
        const doc = await this.services.knowledge.reindex(id);
        if (doc) await this.client?.upsert([doc]);
        else await this.client?.remove([id]);
      }
    } catch (error) {
      logDiagnostic('error', 'reindex-failed', describeError(error));
    }
    useUiStore.getState().bumpKnowledge();
  }

  async search(query: string): Promise<{ hits: SearchHit[]; ms: number }> {
    await this.flush();
    return this.client ? this.client.search(query, 30) : { hits: [], ms: 0 };
  }

  stop(): void {
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
    this.client?.terminate();
  }
}
