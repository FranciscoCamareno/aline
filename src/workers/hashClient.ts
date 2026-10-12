import { subtleSha256, type Sha256 } from '../shared/hash.ts';
import type { HashRequest, HashResponse } from './hash.worker.ts';

/**
 * Por debajo de este tamaño el viaje al worker cuesta más que el propio hash; se calcula en el
 * hilo principal con Web Crypto, que ya es asíncrono.
 */
export const WORKER_THRESHOLD_BYTES = 16 * 1024;

export interface HashWorkerClient {
  sha256: Sha256;
  /** Pausa el worker (p. ej. antes de activar un Service Worker nuevo). */
  terminate(): void;
  /** Número de hashes calculados en el worker; sirve para diagnóstico y pruebas. */
  readonly workerHashes: number;
}

export function createHashWorkerClient(): HashWorkerClient {
  let worker: Worker | null = null;
  let nextId = 0;
  let workerHashes = 0;
  const pending = new Map<number, { resolve: (hex: string) => void; reject: (e: Error) => void }>();

  const failAll = (message: string) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<HashResponse>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      if ('hex' in event.data) {
        workerHashes++;
        entry.resolve(event.data.hex);
      } else {
        entry.reject(new Error(event.data.error));
      }
    };
    worker.onerror = () => {
      failAll('El worker de hash falló');
      worker?.terminate();
      worker = null;
    };
    return worker;
  };

  return {
    sha256(bytes) {
      if (bytes.byteLength < WORKER_THRESHOLD_BYTES) return subtleSha256(bytes);
      return new Promise<string>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        // Se copia (no se transfiere): quien llama sigue usando los bytes.
        const request: HashRequest = { id, bytes };
        ensureWorker().postMessage(request);
      }).catch(() => subtleSha256(bytes));
    },
    terminate() {
      failAll('Worker de hash pausado');
      worker?.terminate();
      worker = null;
    },
    get workerHashes() {
      return workerHashes;
    },
  };
}
