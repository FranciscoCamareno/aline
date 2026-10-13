import type { EncryptionFile, KeySlot } from '../domain/encryption.ts';
import { utf8Encode } from './hash.ts';

/**
 * Cifrado del almacén en Drive con Web Crypto (diseño §13.1). Una clave aleatoria de 32 bytes
 * por almacén; se guarda envuelta (AES-256-GCM) con una clave derivada por PBKDF2-SHA256 de la
 * contraseña y, aparte, del código de recuperación. De la clave del almacén se derivan por HKDF
 * una clave AES-GCM para el contenido y una clave HMAC para nombrar objetos.
 */

/** Recomendación OWASP 2023 para PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
const MAGIC = utf8Encode('MNE1');
const IV_BYTES = 12;

export class WrongSecretError extends Error {
  constructor() {
    super('La contraseña o el código de recuperación no son correctos');
    this.name = 'WrongSecretError';
  }
}

export interface VaultKeys {
  /** AES-256-GCM, no extraíble. */
  content: CryptoKey;
  /** HMAC-SHA256, no extraíble. */
  objectIds: CryptoKey;
}

const buf = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function random(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Alfabeto sin caracteres confundibles (Crockford). */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Código de recuperación: 160 bits aleatorios en 8 grupos de 4 caracteres. */
export function generateRecoveryCode(): string {
  const bytes = random(20);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CODE_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

/** Admite minúsculas, espacios y guiones al teclearlo; O→0 e I/L→1 como en Crockford. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

async function deriveWrappingKey(secret: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', buf(utf8Encode(secret)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const slotAad = (vaultId: string, kind: KeySlot['kind']) =>
  buf(utf8Encode(`mindnote-key|${vaultId}|${kind}`));

async function wrapSlot(
  vaultId: string,
  raw: Uint8Array,
  kind: KeySlot['kind'],
  secret: string,
  iterations: number,
): Promise<KeySlot> {
  const salt = random(16);
  const iv = random(IV_BYTES);
  const key = await deriveWrappingKey(
    kind === 'recovery' ? normalizeRecoveryCode(secret) : secret,
    salt,
    iterations,
  );
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: buf(iv), additionalData: slotAad(vaultId, kind) },
      key,
      buf(raw),
    ),
  );
  return {
    kind,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrappedKey: toBase64(wrapped),
  };
}

/** Crea la clave del almacén y su descriptor; la clave en claro solo existe en memoria. */
export async function createEncryption(
  vaultId: string,
  password: string,
  recoveryCode: string,
  options: { iterations?: number; now?: Date } = {},
): Promise<{ file: EncryptionFile; raw: Uint8Array }> {
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const raw = random(32);
  const at = (options.now ?? new Date()).toISOString();
  return {
    raw,
    file: {
      schemaVersion: 1,
      vaultId,
      cipher: 'AES-256-GCM',
      objectIds: 'HMAC-SHA256',
      keys: [
        await wrapSlot(vaultId, raw, 'password', password, iterations),
        await wrapSlot(vaultId, raw, 'recovery', recoveryCode, iterations),
      ],
      createdAt: at,
      updatedAt: at,
    },
  };
}

/** Desenvuelve la clave con la contraseña o con el código de recuperación. */
export async function unlockRawKey(file: EncryptionFile, secret: string): Promise<Uint8Array> {
  for (const slot of file.keys) {
    const candidate = slot.kind === 'recovery' ? normalizeRecoveryCode(secret) : secret;
    if (!candidate) continue;
    try {
      const key = await deriveWrappingKey(candidate, fromBase64(slot.salt), slot.iterations);
      return new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: buf(fromBase64(slot.iv)),
            additionalData: slotAad(file.vaultId, slot.kind),
          },
          key,
          buf(fromBase64(slot.wrappedKey)),
        ),
      );
    } catch {
      // Esta ranura no corresponde al secreto; se prueba la siguiente.
    }
  }
  throw new WrongSecretError();
}

/** Sustituye la ranura de un tipo (cambiar contraseña o generar otro código de recuperación). */
export async function replaceSlot(
  file: EncryptionFile,
  raw: Uint8Array,
  kind: KeySlot['kind'],
  secret: string,
  options: { iterations?: number; now?: Date } = {},
): Promise<EncryptionFile> {
  const slot = await wrapSlot(
    file.vaultId,
    raw,
    kind,
    secret,
    options.iterations ?? PBKDF2_ITERATIONS,
  );
  return {
    ...file,
    keys: [...file.keys.filter((k) => k.kind !== kind), slot],
    updatedAt: (options.now ?? new Date()).toISOString(),
  };
}

export async function deriveVaultKeys(raw: Uint8Array): Promise<VaultKeys> {
  const base = await crypto.subtle.importKey('raw', buf(raw), 'HKDF', false, ['deriveKey']);
  const hkdf = (info: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(32),
    info: buf(utf8Encode(info)),
  });
  return {
    content: await crypto.subtle.deriveKey(
      hkdf('mindnote-content-aes-gcm-v1'),
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
    objectIds: await crypto.subtle.deriveKey(
      hkdf('mindnote-object-id-hmac-v1'),
      base,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    ),
  };
}

/** Qué se cifra; forma parte de los datos autenticados junto con el almacén y el id. */
export type CipherScope = 'object' | 'revision' | 'control' | 'index';

/**
 * Cifra y descifra archivos del almacén: `MNE1` + IV (12 bytes) + AES-256-GCM. Los datos
 * autenticados (`vaultId|ámbito|id`) impiden mover un archivo cifrado a otro sitio o almacén
 * sin que se detecte.
 */
export class VaultCipher {
  private readonly keys: VaultKeys;
  private readonly vaultId: string;

  constructor(keys: VaultKeys, vaultId: string) {
    this.keys = keys;
    this.vaultId = vaultId;
  }

  private aad(scope: CipherScope, id: string) {
    return buf(utf8Encode(`${this.vaultId}|${scope}|${id}`));
  }

  async encrypt(scope: CipherScope, id: string, plain: Uint8Array): Promise<Uint8Array> {
    const iv = random(IV_BYTES);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: buf(iv), additionalData: this.aad(scope, id) },
        this.keys.content,
        buf(plain),
      ),
    );
    const out = new Uint8Array(MAGIC.byteLength + IV_BYTES + sealed.byteLength);
    out.set(MAGIC, 0);
    out.set(iv, MAGIC.byteLength);
    out.set(sealed, MAGIC.byteLength + IV_BYTES);
    return out;
  }

  /** Lanza un error si el archivo no es de este almacén, de este id o fue alterado. */
  async decrypt(scope: CipherScope, id: string, sealed: Uint8Array): Promise<Uint8Array> {
    if (!MAGIC.every((b, i) => sealed[i] === b))
      throw new Error('Archivo sin cifrar o desconocido');
    const iv = sealed.subarray(MAGIC.byteLength, MAGIC.byteLength + IV_BYTES);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: buf(iv.slice()), additionalData: this.aad(scope, id) },
        this.keys.content,
        buf(sealed.slice(MAGIC.byteLength + IV_BYTES)),
      ),
    );
  }

  /** Nombre opaco de un objeto: HMAC-SHA256(hash) en hexadecimal. */
  async objectId(hash: string): Promise<string> {
    const mac = new Uint8Array(
      await crypto.subtle.sign('HMAC', this.keys.objectIds, buf(utf8Encode(hash))),
    );
    return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
