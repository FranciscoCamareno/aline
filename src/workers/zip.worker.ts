/** Worker de ZIP (diseño §4 y §12.2): empaqueta y desempaqueta fuera del hilo de la interfaz. */
import { unzipFiles, zipFiles } from '../adapters/zip/fflateArchiver.ts';
import type { UnzipLimits } from '../ports/Archiver.ts';

export type ZipRequest =
  | { id: number; op: 'zip'; files: Array<[string, Uint8Array]> }
  | { id: number; op: 'unzip'; bytes: Uint8Array; limits: UnzipLimits };

export type ZipResponse =
  | { id: number; ok: true; zip: Uint8Array }
  | {
      id: number;
      ok: true;
      files: Array<[string, Uint8Array]>;
      rejected: Array<{ path: string; reason: 'unsafe-path' | 'directory' }>;
    }
  | { id: number; ok: false; error: string; name: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ZipRequest>) => void) | null;
  postMessage(message: ZipResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  const req = event.data;
  try {
    if (req.op === 'zip') {
      const zip = zipFiles(new Map(req.files));
      scope.postMessage({ id: req.id, ok: true, zip }, [zip.buffer]);
    } else {
      const { files, rejected } = unzipFiles(req.bytes, req.limits);
      const list = [...files];
      scope.postMessage(
        { id: req.id, ok: true, files: list, rejected },
        list.map(([, bytes]) => bytes.buffer),
      );
    }
  } catch (error) {
    scope.postMessage({
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Error',
    });
  }
};
