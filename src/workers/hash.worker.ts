/** Worker de SHA-256 (diseño §4: hash fuera del hilo principal). */
import { subtleSha256 } from '../shared/hash.ts';

export interface HashRequest {
  id: number;
  bytes: Uint8Array;
}

export type HashResponse = { id: number; hex: string } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage(message: HashResponse): void;
};

scope.onmessage = (event) => {
  const { id, bytes } = event.data;
  subtleSha256(bytes).then(
    (hex) => scope.postMessage({ id, hex }),
    (error: unknown) =>
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
  );
};
