/** Empaquetado ZIP de un árbol de archivos (diseño §12.2). Implementado con fflate en un worker. */
export interface UnzipLimits {
  maxEntries: number;
  /** Suma de tamaños descomprimidos admitida (protección ante bombas de descompresión). */
  maxTotalBytes: number;
  maxFileBytes: number;
}

export interface UnzipResult {
  files: Map<string, Uint8Array>;
  /** Entradas no extraídas: rutas inseguras (absolutas, con «..», con unidades) o directorios. */
  rejected: Array<{ path: string; reason: 'unsafe-path' | 'directory' }>;
}

export interface Archiver {
  zip(files: Map<string, Uint8Array>): Promise<Uint8Array>;
  /** Lanza si se superan los límites; nunca escribe fuera del mapa devuelto. */
  unzip(bytes: Uint8Array, limits: UnzipLimits): Promise<UnzipResult>;
}

export const DEFAULT_UNZIP_LIMITS: UnzipLimits = {
  maxEntries: 500_000,
  maxTotalBytes: 2 * 1024 ** 3,
  maxFileBytes: 512 * 1024 ** 2,
};
