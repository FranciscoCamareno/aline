import { VaultDatabase } from '../adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../adapters/indexeddb/DexieVaultRepository.ts';
import type { VaultEntry } from '../adapters/indexeddb/registry.ts';
import {
  createBackup,
  emergencyToContent,
  readBackup,
  type BackupVerification,
} from '../application/backup.ts';
import { vaultToFiles, type ReadProblem } from '../application/vaultFormat.ts';
import type { EmergencyExport } from '../application/VaultService.ts';
import { describeError } from '../ports/Diagnostics.ts';
import type { VaultContent } from '../ports/VaultRepository.ts';
import { utf8Decode } from '../shared/hash.ts';
import { createZipWorkerArchiver } from '../workers/zipClient.ts';
import { downloadBlob, fileTimestamp } from './download.ts';
import { flushAllWrites, logDiagnostic } from './runtime.ts';
import type { AppServices } from './services.ts';

/** Acciones de almacenes y copias (plan 2.2 y 2.3). */
const archiver = createZipWorkerArchiver();

export function contentBytes(content: VaultContent): number {
  let total = 0;
  for (const blob of content.blobs.values()) total += blob.byteLength;
  return total;
}

/** Copia completa en ZIP con manifiesto (RF-32). Devuelve el tamaño del contenido copiado. */
export async function downloadBackup(services: AppServices): Promise<number> {
  await flushAllWrites();
  const content = await services.service.exportContent();
  try {
    const backup = await createBackup(content, {
      deviceId: services.device.deviceId,
      appVersion: __APP_VERSION__,
      archiver,
    });
    const safeName = services.vault.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);
    downloadBlob(
      `mindnote-copia-${safeName}-${fileTimestamp()}.zip`,
      new Blob([backup.zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    );
    logDiagnostic(
      'info',
      'backup-created',
      `archivos=${backup.fileCount} bytes=${backup.contentBytes} zip=${backup.zip.byteLength}`,
    );
    return backup.contentBytes;
  } catch (error) {
    logDiagnostic('error', 'backup-failed', describeError(error));
    throw error;
  }
}

export interface RestoreReport {
  entry: VaultEntry;
  documents: number;
  revisions: number;
  blobs: number;
  problems: ReadProblem[];
  verification: BackupVerification | null;
  /** El contenido importado coincide byte a byte con el de la copia (§12.2, paso 5). */
  identical: boolean;
}

function sameContent(a: VaultContent, b: VaultContent): boolean {
  const pick = (c: VaultContent) =>
    new Map(
      [...vaultToFiles(c, { deviceId: '00000000-0000-4000-8000-000000000000' })].filter(([p]) =>
        /^(vault\.json|revisions\/|objects\/|assets\/|readable\/|controls\/)/.test(p),
      ),
    );
  const fa = pick(a);
  const fb = pick(b);
  if (fa.size !== fb.size) return false;
  for (const [path, bytes] of fa) {
    const other = fb.get(path);
    if (!other || other.byteLength !== bytes.byteLength) return false;
    for (let i = 0; i < bytes.byteLength; i++) if (bytes[i] !== other[i]) return false;
  }
  return true;
}

/**
 * Restaura una copia ZIP (o una exportación de emergencia JSON) en un almacén NUEVO, nunca
 * encima del activo; compara el inventario antes de ofrecer abrirlo (diseño §12.2).
 */
export async function restoreFromFile(services: AppServices, file: File): Promise<RestoreReport> {
  if (!services.registry) throw new Error('El almacén temporal no admite restauraciones');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let content: VaultContent;
  let problems: ReadProblem[] = [];
  let verification: BackupVerification | null = null;
  if (/\.json$/i.test(file.name)) {
    content = await emergencyToContent(JSON.parse(utf8Decode(bytes)) as EmergencyExport);
  } else {
    const read = await readBackup(bytes, archiver);
    content = read.read.content;
    problems = read.read.problems;
    verification = read.verification;
  }

  const label = `${content.vault.name} (restaurado ${new Date().toLocaleDateString()})`;
  const entry = await services.registry.register(label, 'restored');
  const db = new VaultDatabase(entry.dbName);
  try {
    const repo = new DexieVaultRepository(db);
    await repo.importContent(content);
    const identical = sameContent(content, await repo.exportContent());
    await services.registry.touch(entry.dbName, content.vault.id);
    logDiagnostic(
      identical ? 'info' : 'warn',
      'restore-completed',
      `revisiones=${content.revisions.length} blobs=${content.blobs.size} problemas=${problems.length} idéntico=${identical}`,
    );
    return {
      entry,
      documents: content.documents.length,
      revisions: content.revisions.length,
      blobs: content.blobs.size,
      problems,
      verification,
      identical,
    };
  } catch (error) {
    db.close();
    await services.registry.forget(entry.dbName);
    logDiagnostic('error', 'restore-failed', describeError(error));
    throw error;
  } finally {
    db.close();
  }
}

/** Abre otro almacén: guarda lo pendiente y recarga la aplicación con él. */
export async function switchVault(services: AppServices, dbName: string): Promise<void> {
  if (!services.registry) return;
  await flushAllWrites();
  await services.service.whenIdle();
  await services.registry.setActive(dbName);
  location.reload();
}

export async function createVault(services: AppServices, name: string): Promise<void> {
  if (!services.registry) return;
  const entry = await services.registry.register(name.trim() || 'Almacén', 'created');
  await switchVault(services, entry.dbName);
}
