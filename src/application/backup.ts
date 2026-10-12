import { backupManifestSchema } from '../domain/format.ts';
import { base64ToBytes } from '../shared/base64.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../shared/hash.ts';
import { DEFAULT_UNZIP_LIMITS, type Archiver } from '../ports/Archiver.ts';
import type { StoredBlob } from '../ports/VaultRepository.ts';
import {
  filesToVault,
  isFormatPath,
  vaultToFiles,
  type ReadResult,
  type VaultContent,
} from './vaultFormat.ts';
import type { EmergencyExport } from './VaultService.ts';

/**
 * Copia completa y restauración (diseño §12.2, RF-32, CA-16): ZIP con el formato abierto,
 * historial, papelera y controles, más backup-manifest.json con el SHA-256 de cada archivo.
 * Excluye tokens, permisos e índices reconstruibles.
 */
export const MANIFEST_PATH = 'backup-manifest.json';
/** A partir de este tamaño se avisa antes de generar la copia (propuesta del diseño). */
export const LARGE_BACKUP_BYTES = 250 * 1024 ** 2;

export interface BackupResult {
  zip: Uint8Array;
  fileCount: number;
  contentBytes: number;
}

export async function createBackup(
  content: VaultContent,
  {
    deviceId,
    appVersion,
    archiver,
    now = new Date(),
  }: {
    deviceId: string;
    appVersion: string;
    archiver: Archiver;
    now?: Date;
  },
): Promise<BackupResult> {
  const files = vaultToFiles(content, { deviceId, now });
  const entries = [];
  let contentBytes = 0;
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    entries.push({ path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
    contentBytes += bytes.byteLength;
  }
  const manifest = backupManifestSchema.parse({
    schemaVersion: 1,
    vaultId: content.vault.id,
    formatVersion: 1,
    createdAt: now.toISOString(),
    appVersion,
    files: entries,
  });
  files.set(MANIFEST_PATH, utf8Encode(`${JSON.stringify(manifest, null, 2)}\n`));
  return { zip: await archiver.zip(files), fileCount: files.size, contentBytes };
}

export interface BackupVerification {
  /** Rutas del manifiesto que faltan en el ZIP. */
  missing: string[];
  /** Rutas cuyo tamaño o SHA-256 no coincide con el manifiesto. */
  mismatched: string[];
  /** Rutas presentes que el manifiesto no declara (no se importan). */
  undeclared: string[];
  /** Entradas no extraídas por ruta insegura o por no pertenecer al formato. */
  rejected: string[];
}

export interface RestoreRead {
  read: ReadResult;
  verification: BackupVerification;
  manifestCreatedAt: string;
}

export class BackupError extends Error {
  readonly code: 'no-manifest' | 'invalid-manifest' | 'vault-mismatch' | 'corrupt';

  constructor(code: BackupError['code'], message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

/**
 * Lee y verifica una copia (diseño §12.2, paso 3): manifiesto, hashes, rutas y límites de
 * descompresión. Un archivo dañado o ausente impide la restauración: no se restaura a medias.
 */
export async function readBackup(zip: Uint8Array, archiver: Archiver): Promise<RestoreRead> {
  const { files, rejected } = await archiver.unzip(zip, DEFAULT_UNZIP_LIMITS);
  const manifestBytes = files.get(MANIFEST_PATH);
  if (!manifestBytes)
    throw new BackupError('no-manifest', 'La copia no tiene backup-manifest.json');
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(utf8Decode(manifestBytes));
  } catch {
    throw new BackupError('invalid-manifest', 'backup-manifest.json no es JSON');
  }
  const manifest = backupManifestSchema.safeParse(manifestValue);
  if (!manifest.success)
    throw new BackupError('invalid-manifest', 'backup-manifest.json no es válido');

  const verification: BackupVerification = {
    missing: [],
    mismatched: [],
    undeclared: [],
    rejected: rejected.map((r) => r.path),
  };
  const declared = new Map(manifest.data.files.map((f) => [f.path, f]));
  const accepted = new Map<string, Uint8Array>();
  for (const entry of manifest.data.files) {
    const bytes = files.get(entry.path);
    if (!bytes) {
      verification.missing.push(entry.path);
      continue;
    }
    if (bytes.byteLength !== entry.bytes || (await sha256Hex(bytes)) !== entry.sha256) {
      verification.mismatched.push(entry.path);
      continue;
    }
    if (isFormatPath(entry.path)) accepted.set(entry.path, bytes);
    else verification.rejected.push(entry.path);
  }
  for (const path of files.keys()) {
    if (path !== MANIFEST_PATH && !declared.has(path)) verification.undeclared.push(path);
  }
  if (verification.missing.length || verification.mismatched.length) {
    throw new BackupError(
      'corrupt',
      `Copia dañada: ${verification.missing.length} archivos ausentes, ${verification.mismatched.length} alterados`,
    );
  }

  const read = await filesToVault(accepted);
  if (read.content.vault.id !== manifest.data.vaultId) {
    throw new BackupError('vault-mismatch', 'El manifiesto pertenece a otro almacén');
  }
  return { read, verification, manifestCreatedAt: manifest.data.createdAt };
}

/** Convierte una exportación de emergencia (JSON) en contenido restaurable, verificando hashes. */
export async function emergencyToContent(data: EmergencyExport): Promise<VaultContent> {
  if (data.kind !== 'mindnote-emergency-export' || data.exportFormatVersion !== 1) {
    throw new BackupError('invalid-manifest', 'No es una exportación de emergencia v1');
  }
  const blobs = new Map<string, StoredBlob>();
  for (const b of data.blobs) {
    const bytes = base64ToBytes(b.base64);
    if ((await sha256Hex(bytes)) !== b.hash)
      throw new BackupError('corrupt', `Blob alterado: ${b.hash}`);
    blobs.set(b.hash, { hash: b.hash, mimeType: b.mimeType, byteLength: bytes.byteLength, bytes });
  }
  const files = vaultToFiles(
    {
      vault: data.snapshot.vault,
      documents: data.snapshot.documents,
      revisions: data.snapshot.revisions,
      blobs,
      controls: data.snapshot.controls,
    },
    { deviceId: data.snapshot.vault.id },
  );
  // Pasa por el mismo lector que una copia ZIP: mismas validaciones y cabezas recalculadas.
  return (await filesToVault(files)).content;
}
