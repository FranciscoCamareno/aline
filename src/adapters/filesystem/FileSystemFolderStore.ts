import { notImplemented } from '../../domain/errors.ts';
import type { LocalFolderStore } from '../../ports/LocalFolderStore.ts';

/**
 * PENDIENTE — Carpeta Windows con File System Access (diseño §7.1, §8.4, [S5]).
 * createWritable/close protege cada archivo, no un conjunto: escribir objetos nuevos por hash y
 * publicar la revisión al final. Ante carpeta desconectada, mantener la cola local.
 */
export class FileSystemFolderStore implements LocalFolderStore {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async chooseFolder(): Promise<void> {
    return notImplemented('carpeta local: selección');
  }

  hasPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }

  async writeObject(_path: string, _bytes: Uint8Array): Promise<void> {
    return notImplemented('carpeta local: escritura');
  }

  async scanReadableCopies(): Promise<Array<{ path: string; hash: string }>> {
    return notImplemented('carpeta local: detección de ediciones externas');
  }
}
