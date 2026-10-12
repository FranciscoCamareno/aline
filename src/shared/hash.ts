/** SHA-256 en hexadecimal sobre bytes exactos (diseño §5.1). */
export type Sha256 = (bytes: Uint8Array) => Promise<string>;

/** Implementación directa con Web Crypto; la usan el worker y las pruebas. */
export const subtleSha256: Sha256 = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

let implementation: Sha256 = subtleSha256;

/**
 * La aplicación instala aquí el cliente del worker de hash (diseño §4, §7.1: calcular hashes
 * fuera del hilo principal). Sin instalar, se usa Web Crypto en el mismo hilo.
 */
export function setSha256Implementation(next: Sha256 | null): void {
  implementation = next ?? subtleSha256;
}

export function sha256Hex(bytes: Uint8Array): Promise<string> {
  return implementation(bytes);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8Encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
