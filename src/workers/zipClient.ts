import type { Archiver, UnzipLimits, UnzipResult } from '../ports/Archiver.ts';
import type { ZipRequest, ZipResponse } from './zip.worker.ts';

/** Petición sin id; Omit distributivo para conservar cada variante de la unión. */
type ZipCommand = ZipRequest extends infer R
  ? R extends ZipRequest
    ? Omit<R, 'id'>
    : never
  : never;

type Pending = { resolve: (r: ZipResponse) => void; reject: (e: Error) => void };

/** Archiver que delega en zip.worker.ts; se crea al usarlo y se cierra al terminar cada tarea. */
export function createZipWorkerArchiver(): Archiver {
  let nextId = 0;

  const run = (request: ZipCommand, transfer: Transferable[] = []) =>
    new Promise<ZipResponse>((resolve, reject) => {
      const worker = new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' });
      const id = nextId++;
      const pending: Pending = { resolve, reject };
      worker.onmessage = (event: MessageEvent<ZipResponse>) => {
        if (event.data.id !== id) return;
        worker.terminate();
        pending.resolve(event.data);
      };
      worker.onerror = (event) => {
        worker.terminate();
        pending.reject(new Error(event.message || 'El worker de ZIP falló'));
      };
      worker.postMessage({ ...request, id } as ZipRequest, transfer);
    });

  return {
    async zip(files) {
      const res = await run({ op: 'zip', files: [...files] });
      if (!res.ok) throw Object.assign(new Error(res.error), { name: res.name });
      if (!('zip' in res)) throw new Error('Respuesta inesperada del worker de ZIP');
      return res.zip;
    },
    async unzip(bytes: Uint8Array, limits: UnzipLimits): Promise<UnzipResult> {
      const res = await run({ op: 'unzip', bytes, limits });
      if (!res.ok) throw Object.assign(new Error(res.error), { name: res.name });
      if (!('files' in res)) throw new Error('Respuesta inesperada del worker de ZIP');
      return { files: new Map(res.files), rejected: res.rejected };
    },
  };
}
