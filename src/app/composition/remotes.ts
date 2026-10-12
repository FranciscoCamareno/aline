import {
  FolderRemoteStore,
  type DirHandleLike,
} from '../../adapters/filesystem/FolderRemoteStore.ts';
import type { Vault } from '../../domain/vault.ts';
import type { RemoteAuth } from '../../ports/RemoteAuth.ts';
import type { RemoteStore } from '../../ports/RemoteStore.ts';

/**
 * Raíz de composición de los almacenes remotos: el único sitio de app/ que conoce los
 * adaptadores de carpeta y de Drive. La interfaz trabaja con el puerto.
 */
export function folderRemote(handle: FileSystemDirectoryHandle): RemoteStore {
  return new FolderRemoteStore(handle as unknown as DirHandleLike);
}

export function readFolderVault(handle: FileSystemDirectoryHandle): Promise<Vault | null> {
  return folderRemote(handle).readVault();
}

/** Almacén encontrado en el Drive de la cuenta autorizada. */
export interface DriveVaultChoice {
  folderId: string;
  folderName: string;
  vault: Vault;
}

export interface DriveConnection {
  auth: RemoteAuth;
  listVaults(): Promise<DriveVaultChoice[]>;
  createVault(vault: Vault): Promise<DriveVaultChoice>;
  remote(folderId: string): RemoteStore;
}

/**
 * Conexión con Google Drive. Los módulos de Drive se cargan solo aquí (al pulsar «Conectar»):
 * ni GIS ni ninguna petición a Google ocurren sin esa elección (RNF-05, CA-27).
 */
export async function driveConnection(): Promise<DriveConnection> {
  const [{ GoogleAuth }, { DriveClient }, drive] = await Promise.all([
    import('../../adapters/drive/GoogleAuth.ts'),
    import('../../adapters/drive/driveApi.ts'),
    import('../../adapters/drive/DriveRemoteStore.ts'),
  ]);
  // Público por diseño (diseño §13); nunca el secreto del cliente.
  const clientId = (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) || null;
  if (!clientId) throw new Error('Falta VITE_GOOGLE_CLIENT_ID en la compilación');
  const auth = new GoogleAuth(clientId);
  const client = new DriveClient(
    (input, init) => fetch(input, init),
    () => auth.getAccessToken(),
  );
  return {
    auth,
    listVaults: () => drive.listDriveVaults(client),
    createVault: (vault) => drive.createDriveVault(client, vault),
    remote: (folderId) => new drive.DriveRemoteStore(client, folderId),
  };
}
