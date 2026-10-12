/**
 * Carpeta local en Windows mediante File System Access (diseño §7.1 y §8.4). PENDIENTE.
 * Escribe objetos nuevos por hash y publica la revisión al final; revalida permisos al reiniciar.
 */
export interface LocalFolderStore {
  isSupported(): boolean;
  chooseFolder(): Promise<void>;
  hasPermission(): Promise<boolean>;
  writeObject(path: string, bytes: Uint8Array): Promise<void>;
  /** Lectura y comparación de hashes de copias readable (sin observación instantánea). */
  scanReadableCopies(): Promise<Array<{ path: string; hash: string }>>;
}
