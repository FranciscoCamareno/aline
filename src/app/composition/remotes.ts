import {
  FolderRemoteStore,
  type DirHandleLike,
} from '../../adapters/filesystem/FolderRemoteStore.ts';
import type { DriveEncryptionChoice } from '../../domain/encryption.ts';
import type { Vault } from '../../domain/vault.ts';
import type { RemoteAuth } from '../../ports/RemoteAuth.ts';
import type { RemoteStore } from '../../ports/RemoteStore.ts';
import type { VaultKeys } from '../../shared/crypto.ts';

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
  encrypted: boolean;
}

export interface DriveConnection {
  auth: RemoteAuth;
  listVaults(): Promise<DriveVaultChoice[]>;
  /** Crea la carpeta del almacén en el modo elegido; si se cifra, devuelve también la clave. */
  createVault(
    vault: Vault,
    choice: DriveEncryptionChoice,
  ): Promise<{ entry: DriveVaultChoice; keys: VaultKeys | null }>;
  remote(folderId: string, vaultId: string, keys: VaultKeys | null): RemoteStore;
  /** Abre la clave con la contraseña o el código de recuperación (WrongSecretError si no). */
  unlock(folderId: string, secret: string): Promise<VaultKeys>;
  /** Sustituye la contraseña o el código; exige un secreto vigente. */
  replaceSecret(
    folderId: string,
    current: string,
    kind: 'password' | 'recovery',
    next: string,
  ): Promise<void>;
  markSuperseded(oldFolderId: string, newFolderId: string): Promise<void>;
  /** Carpeta que sustituyó a esta, si la hay (aunque esta esté en la papelera). */
  successorOf(folderId: string): Promise<string | null>;
  trashFolder(folderId: string): Promise<void>;
}

/**
 * Conexión con Google Drive. Los módulos de Drive se cargan solo aquí (al pulsar «Conectar»):
 * ni GIS ni ninguna petición a Google ocurren sin esa elección (RNF-05, CA-27).
 */
export async function driveConnection(): Promise<DriveConnection> {
  const [{ GoogleAuth }, { DriveClient }, drive, crypto] = await Promise.all([
    import('../../adapters/drive/GoogleAuth.ts'),
    import('../../adapters/drive/driveApi.ts'),
    import('../../adapters/drive/DriveRemoteStore.ts'),
    import('../../shared/crypto.ts'),
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
    createVault: async (vault, choice) => {
      if (choice.mode === 'plain') {
        return { entry: await drive.createDriveVault(client, vault, null), keys: null };
      }
      const { file, raw } = await crypto.createEncryption(
        vault.id,
        choice.password,
        choice.recoveryCode,
      );
      const keys = await crypto.deriveVaultKeys(raw);
      raw.fill(0);
      return { entry: await drive.createDriveVault(client, vault, file), keys };
    },
    remote: (folderId, vaultId, keys) =>
      new drive.DriveRemoteStore(client, folderId, {
        cipher: keys ? new crypto.VaultCipher(keys, vaultId) : null,
      }),
    unlock: async (folderId, secret) => {
      const raw = await crypto.unlockRawKey(
        await drive.readDriveEncryption(client, folderId),
        secret,
      );
      try {
        return await crypto.deriveVaultKeys(raw);
      } finally {
        raw.fill(0);
      }
    },
    replaceSecret: async (folderId, current, kind, next) => {
      const file = await drive.readDriveEncryption(client, folderId);
      const raw = await crypto.unlockRawKey(file, current);
      try {
        await drive.writeDriveEncryption(
          client,
          folderId,
          await crypto.replaceSlot(file, raw, kind, next),
        );
      } finally {
        raw.fill(0);
      }
    },
    markSuperseded: (oldFolderId, newFolderId) =>
      drive.markDriveSuperseded(client, oldFolderId, newFolderId),
    successorOf: (folderId) => drive.driveSuccessor(client, folderId),
    trashFolder: (folderId) => drive.trashDriveFolder(client, folderId),
  };
}
