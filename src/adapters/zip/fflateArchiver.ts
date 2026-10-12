import { unzipSync, zipSync, type Zippable } from 'fflate';
import type { UnzipLimits, UnzipResult } from '../../ports/Archiver.ts';

/** Ruta segura dentro del archivo: relativa, sin «..», sin unidades ni barras invertidas. */
export function isSafeArchivePath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.startsWith('/') || path.includes('\\') || /^[a-z]:/i.test(path)) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export class ArchiveLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveLimitError';
  }
}

/** Empaqueta sin volver a comprimir lo que ya lo está (imágenes y fuentes). */
export function zipFiles(files: Map<string, Uint8Array>): Uint8Array {
  const tree: Zippable = {};
  for (const [path, bytes] of files) {
    const compressed = /\.(png|jpe?g|gif|webp|avif|woff2?)$/i.test(path);
    tree[path] = [bytes, { level: compressed ? 0 : 6 }];
  }
  return zipSync(tree);
}

/**
 * Descomprime validando cada entrada ANTES de inflarla (tamaño declarado y ruta), y vuelve a
 * comprobar los tamaños reales después (diseño §12.2, paso 3).
 */
export function unzipFiles(bytes: Uint8Array, limits: UnzipLimits): UnzipResult {
  const rejected: UnzipResult['rejected'] = [];
  let entries = 0;
  let declared = 0;
  const raw = unzipSync(bytes, {
    filter(file) {
      entries++;
      if (entries > limits.maxEntries) throw new ArchiveLimitError('Demasiadas entradas');
      if (file.name.endsWith('/')) {
        rejected.push({ path: file.name, reason: 'directory' });
        return false;
      }
      if (!isSafeArchivePath(file.name)) {
        rejected.push({ path: file.name, reason: 'unsafe-path' });
        return false;
      }
      if (file.originalSize > limits.maxFileBytes) {
        throw new ArchiveLimitError(`Archivo demasiado grande: ${file.name}`);
      }
      declared += file.originalSize;
      if (declared > limits.maxTotalBytes) throw new ArchiveLimitError('Tamaño total excesivo');
      return true;
    },
  });
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const [path, data] of Object.entries(raw)) {
    total += data.byteLength;
    if (data.byteLength > limits.maxFileBytes || total > limits.maxTotalBytes) {
      throw new ArchiveLimitError('El tamaño real supera el declarado');
    }
    files.set(path, data);
  }
  return { files, rejected };
}
