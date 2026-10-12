import {
  FolderRemoteStore,
  type DirHandleLike,
} from '../../adapters/filesystem/FolderRemoteStore.ts';
import type { Vault } from '../../domain/vault.ts';
import type { RemoteStore } from '../../ports/RemoteStore.ts';

/**
 * Raíz de composición de los almacenes remotos: el único sitio de app/ que conoce los
 * adaptadores de carpeta (y, más adelante, de Drive). La interfaz trabaja con el puerto.
 */
export function folderRemote(handle: FileSystemDirectoryHandle): RemoteStore {
  return new FolderRemoteStore(handle as unknown as DirHandleLike);
}

export function readFolderVault(handle: FileSystemDirectoryHandle): Promise<Vault | null> {
  return folderRemote(handle).readVault();
}
