import { z } from './zod.ts';

/**
 * Cifrado opcional del almacén en Google Drive (cambio de arquitectura del 13/10/2026 que
 * revisa DP-07; diseño §13.1). El propietario elige al conectar Drive si cifra o no, y puede
 * cambiarlo después. `encryption.json` vive en la raíz de la carpeta de Drive, sin cifrar: solo
 * contiene la clave del almacén envuelta con la contraseña y con el código de recuperación.
 */

/** Base64 estándar de exactamente `bytes` bytes (con su relleno). */
function base64Of(bytes: number) {
  const chars = Math.ceil(bytes / 3) * 4;
  const pad = (3 - (bytes % 3)) % 3;
  return z
    .string()
    .length(chars)
    .regex(new RegExp(`^[A-Za-z0-9+/]{${chars - pad}}${'='.repeat(pad)}$`));
}

/**
 * Límites del coste de derivación (auditoría 13/10/2026, H06): `encryption.json` llega de Drive
 * sin cifrar y se lee ANTES de comprobar ningún secreto, así que se valida su forma antes de
 * llamar a PBKDF2. La aplicación crea 600 000 iteraciones; el máximo deja margen para subirlas
 * en el futuro sin permitir minutos de CPU por ranura.
 */
export const MIN_KDF_ITERATIONS = 1_000;
export const MAX_KDF_ITERATIONS = 10_000_000;
/** Una ranura por tipo (contraseña y recuperación); se admite alguna más por compatibilidad. */
export const MAX_KEY_SLOTS = 4;
/** Tamaño máximo de encryption.json al descargarlo. */
export const MAX_ENCRYPTION_FILE_BYTES = 16 * 1024;

export const keySlotSchema = z.object({
  /** Con qué se desenvuelve la clave del almacén. */
  kind: z.enum(['password', 'recovery']),
  kdf: z.literal('PBKDF2-SHA256'),
  iterations: z.number().int().min(MIN_KDF_ITERATIONS).max(MAX_KDF_ITERATIONS),
  salt: base64Of(16),
  iv: base64Of(12),
  /** Clave del almacén (32 bytes) cifrada con AES-256-GCM bajo la clave derivada (+16 de etiqueta). */
  wrappedKey: base64Of(48),
});

export const encryptionFileSchema = z.object({
  schemaVersion: z.literal(1),
  vaultId: z.uuid(),
  cipher: z.literal('AES-256-GCM'),
  /** Los nombres de objetos son HMAC-SHA256 del hash: no revelan contenidos repetidos. */
  objectIds: z.literal('HMAC-SHA256'),
  keys: z.array(keySlotSchema).min(1).max(MAX_KEY_SLOTS),
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
