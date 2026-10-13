import { z } from 'zod';

/**
 * Cifrado opcional del almacén en Google Drive (cambio de arquitectura del 13/10/2026 que
 * revisa DP-07; diseño §13.1). El propietario elige al conectar Drive si cifra o no, y puede
 * cambiarlo después. `encryption.json` vive en la raíz de la carpeta de Drive, sin cifrar: solo
 * contiene la clave del almacén envuelta con la contraseña y con el código de recuperación.
 */
const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const keySlotSchema = z.object({
  /** Con qué se desenvuelve la clave del almacén. */
  kind: z.enum(['password', 'recovery']),
  kdf: z.literal('PBKDF2-SHA256'),
  iterations: z.number().int().min(1),
  salt: base64,
  iv: base64,
  /** Clave del almacén (32 bytes) cifrada con AES-256-GCM bajo la clave derivada. */
  wrappedKey: base64,
});

export const encryptionFileSchema = z.object({
  schemaVersion: z.literal(1),
  vaultId: z.uuid(),
  cipher: z.literal('AES-256-GCM'),
  /** Los nombres de objetos son HMAC-SHA256 del hash: no revelan contenidos repetidos. */
  objectIds: z.literal('HMAC-SHA256'),
  keys: z.array(keySlotSchema).min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type KeySlot = z.infer<typeof keySlotSchema>;
export type EncryptionFile = z.infer<typeof encryptionFileSchema>;

/** Elección del propietario al conectar Drive o al cambiar el modo. */
export type DriveEncryptionChoice =
  { mode: 'plain' } | { mode: 'encrypted'; password: string; recoveryCode: string };

/** Longitud mínima de la contraseña (no hay forma de recuperarla sin el código). */
export const MIN_PASSWORD_LENGTH = 10;
