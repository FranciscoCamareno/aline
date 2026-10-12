import { DexieSyncStore } from '../adapters/indexeddb/DexieSyncStore.ts';
import { SyncEngine, VaultMismatchError } from '../application/SyncEngine.ts';
import type { Vault } from '../domain/vault.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { RemoteError } from '../ports/RemoteStore.ts';
import {
  driveConnection,
  folderRemote,
  readFolderVault,
  type DriveConnection,
  type DriveVaultChoice,
} from './composition/remotes.ts';
import { logDiagnostic } from './runtime.ts';
import type { AppServices } from './services.ts';

export type { DriveVaultChoice } from './composition/remotes.ts';

/**
 * Destino conectado al almacén en este dispositivo (plan 4.1). Solo uno por almacén: carpeta
 * local o Google Drive, nunca ambos (diseño §8.4).
 */
interface FolderBinding {
  kind: 'folder';
  handle: FileSystemDirectoryHandle;
  name: string;
  connectedAt: string;
}
interface DriveBinding {
  kind: 'drive';
  folderId: string;
  name: string;
  connectedAt: string;
}
type Binding = FolderBinding | DriveBinding;

export type RemotePhase =
  | 'idle'
  | 'syncing'
  | 'ok'
  | 'pending'
  | 'needs-permission'
  | 'needs-auth'
  | 'mismatch'
  | 'unavailable'
  | 'error';

export interface RemoteStatus {
  kind: 'folder' | 'drive';
  name: string;
  phase: RemotePhase;
  pending: number;
  lastSyncAt: string | null;
  message: string | null;
}

const BINDING_KEY = 'binding';
const INTERVAL_MS = 60_000;
const AFTER_CHANGE_MS = 3_000;

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export function folderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** El ID de cliente OAuth es público y se incrusta al compilar (diseño §13). */
export function driveConfigured(): boolean {
  return Boolean(import.meta.env['VITE_GOOGLE_CLIENT_ID']);
}

async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (o: {
        mode: 'readwrite';
        id?: string;
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  return picker({ mode: 'readwrite', id: 'mindnote-almacen' });
}

/** Exclusión entre pestañas con Web Locks (§8.2, paso 1); sin la API, se ejecuta sin más. */
function webLock(name: string) {
  return async <T>(task: () => Promise<T>): Promise<T | null> => {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return task();
    return locks.request(name, { ifAvailable: true }, async (lock) => (lock ? task() : null));
  };
}

/**
 * Sincronización con una carpeta local (plan 4.2) o con Google Drive (plan 4.5): el almacén
 * sigue en IndexedDB y el destino recibe el formato abierto. Sincroniza al abrir, al recuperar
 * el foco, tras los cambios y cada minuto mientras la aplicación está visible; nunca con la
 * aplicación cerrada (§1.2).
 */
export class SyncRuntime {
  private readonly services: AppServices;
  private readonly onStatus: (status: RemoteStatus | null) => void;
  private readonly onRemoteChanges: (documentIds: string[]) => void;
  private binding: Binding | null = null;
  /** Conexión con Google (token solo en memoria): se crea al conectar, nunca al arrancar. */
  private drive: DriveConnection | null = null;
  private status: RemoteStatus | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.sync();
  };

  constructor(
    services: AppServices,
    onStatus: (status: RemoteStatus | null) => void,
    onRemoteChanges: (documentIds: string[]) => void,
  ) {
    this.services = services;
    this.onStatus = onStatus;
    this.onRemoteChanges = onRemoteChanges;
  }

  async start(): Promise<void> {
    if (this.services.temporary) return;
    this.binding =
      ((await this.services.repo.getDevicePreference(BINDING_KEY)) as Binding | null) ?? null;
    this.unsubscribe = this.services.service.onCommit(() => this.scheduleSoon());
    document.addEventListener('visibilitychange', this.onVisible);
    this.interval = setInterval(() => {
      if (document.visibilityState === 'visible') void this.sync();
    }, INTERVAL_MS);
    if (!this.binding) return this.setStatus(null);
    // Drive: el token no sobrevive a una recarga y autorizar exige un gesto del usuario.
    if (this.binding.kind === 'drive') return this.setStatus(this.make('needs-auth', null));
    if (await this.hasPermission(false)) await this.sync();
    else this.setStatus(this.make('needs-permission', null));
  }

  stop(): void {
    this.unsubscribe?.();
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Conecta una carpeta elegida por el propietario. Si contiene otro almacén devuelve su
   * identidad para ofrecer abrirlo; nunca mezcla dos almacenes (§8.4).
   */
  async connectFolder(): Promise<
    { connected: true } | { mismatch: Vault; handle: FileSystemDirectoryHandle }
  > {
    const handle = await pickFolder();
    const remoteVault = await readFolderVault(handle);
    if (remoteVault && remoteVault.id !== this.services.vault.id)
      return { mismatch: remoteVault, handle };
    await this.bind({
      kind: 'folder',
      handle,
      name: handle.name,
      connectedAt: new Date().toISOString(),
    });
    return { connected: true };
  }

  /** Abre en este navegador el almacén que contiene una carpeta: almacén nuevo enlazado a ella. */
  async openVaultFromFolder(
    handle: FileSystemDirectoryHandle,
    remoteVault: Vault,
  ): Promise<string> {
    return this.openLinkedVault(remoteVault, `${remoteVault.name} (${handle.name})`, {
      kind: 'folder',
      handle,
      name: handle.name,
      connectedAt: new Date().toISOString(),
    });
  }

  /**
   * Primer paso tras aceptar el aviso RN-12: carga los módulos de Drive y GIS, sin ventanas.
   * Antes de este punto no se hace ninguna petición a Google (RNF-05).
   */
  async prepareDrive(): Promise<void> {
    this.drive ??= await driveConnection();
    await this.drive.auth.prepare();
  }

  /** Si GIS ya está cargado (p. ej. tras «Reconectar» en esta sesión). */
  get driveReady(): boolean {
    return this.drive !== null;
  }

  /**
   * Conecta Google Drive después de aceptar el aviso RN-12 (CA-27). Debe llamarse desde un
   * gesto del usuario: carga GIS y abre la ventana de Google. Si Drive tiene este almacén, se
   * enlaza; si no tiene ninguno, se crea; si solo tiene otros, se devuelven para que el
   * propietario elija (nunca se mezclan).
   */
  async connectDrive(options: {
    acknowledgedUnencryptedContent: true;
  }): Promise<{ connected: true } | { choices: DriveVaultChoice[] }> {
    const drive = await this.authorizeDrive(options);
    const vaults = await drive.listVaults();
    const same = vaults.find((v) => v.vault.id === this.services.vault.id);
    if (same) {
      await this.bind(driveBinding(same));
      return { connected: true };
    }
    if (vaults.length) return { choices: vaults };
    return this.createDriveVault();
  }

  /** Crea en Drive la carpeta de ESTE almacén aunque la cuenta tenga otros. */
  async createDriveVault(): Promise<{ connected: true }> {
    if (!this.drive?.auth.getAccessToken()) throw new RemoteError('auth', 'Necesita autorización');
    const created = await this.drive.createVault(this.services.vault);
    await this.bind(driveBinding(created));
    return { connected: true };
  }

  /** Abre en este navegador un almacén de Drive como almacén aparte enlazado a él. */
  async openVaultFromDrive(choice: DriveVaultChoice): Promise<string> {
    return this.openLinkedVault(
      choice.vault,
      `${choice.vault.name} (Google Drive)`,
      driveBinding(choice),
    );
  }

  /**
   * Pide de nuevo el permiso o la autorización; requiere un gesto del usuario (p. ej. pulsar
   * «Reconectar»). Para Drive, el aviso RN-12 ya se aceptó al conectar este almacén.
   */
  async reconnect(): Promise<void> {
    if (this.binding?.kind === 'drive') {
      await this.authorizeDrive({ acknowledgedUnencryptedContent: true });
      return this.sync();
    }
    if (await this.hasPermission(true)) await this.sync();
  }

  /** Desconectar no borra nada: ni el almacén local ni la carpeta o Drive (§8.4). */
  async disconnect(): Promise<void> {
    if (this.binding?.kind === 'drive') {
      await this.drive?.auth.disconnect().catch(() => undefined);
      this.drive = null;
    }
    this.binding = null;
    await this.services.repo.setDevicePreference(BINDING_KEY, null);
    this.setStatus(null);
  }

  async sync(): Promise<void> {
    if (!this.binding) return;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.runOnce().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.sync();
      }
    });
    return this.running;
  }

  private async runOnce(): Promise<void> {
    const binding = this.binding!;
    if (binding.kind === 'folder' && !(await this.hasPermission(false))) {
      this.setStatus(this.make('needs-permission', null));
      return;
    }
    if (binding.kind === 'drive' && !this.drive?.auth.getAccessToken()) {
      this.setStatus(this.make('needs-auth', null));
      return;
    }
    this.setStatus(this.make('syncing', null));
    const engine = this.engine(binding);
    try {
      const result = await engine.runCycle();
      const pending = await engine.pendingCount();
      this.setStatus({
        ...this.make(pending ? 'pending' : 'ok', null),
        pending,
        lastSyncAt: await engine.lastPullAt(),
      });
      if (result.rejected.length) {
        logDiagnostic(
          'warn',
          'sync-rejected',
          result.rejected.map((r) => `${r.revisionId}:${r.reason}`).join(' '),
        );
      }
      if (result.pulledRevisions || result.pushedRevisions || result.externalEdits) {
        logDiagnostic(
          'info',
          'sync-cycle',
          `${binding.kind} recibidas=${result.pulledRevisions} enviadas=${result.pushedRevisions} externas=${result.externalEdits} conflictos=${result.conflicts.length}`,
        );
      }
      if (result.changedDocuments.length) this.onRemoteChanges(result.changedDocuments);
    } catch (error) {
      logDiagnostic('error', 'sync-failed', describeError(error));
      if (error instanceof VaultMismatchError) {
        this.setStatus(this.make('mismatch', error.message));
      } else if (error instanceof RemoteError && error.kind === 'auth') {
        this.setStatus(this.make('needs-auth', error.message));
      } else if (error instanceof RemoteError && error.kind === 'permission') {
        this.setStatus(
          this.make(binding.kind === 'drive' ? 'error' : 'needs-permission', error.message),
        );
      } else if (error instanceof RemoteError && error.kind === 'not-found') {
        this.setStatus(this.make('unavailable', error.message));
      } else {
        this.setStatus(this.make('error', error instanceof Error ? error.message : String(error)));
      }
    }
  }

  private engine(binding: Binding): SyncEngine {
    const { repo, service, vault, dbName } = this.services;
    return new SyncEngine({
      // Marcas de publicación y cursores separados por destino.
      target: binding.kind,
      remote:
        binding.kind === 'folder'
          ? folderRemote(binding.handle)
          : this.drive!.remote(binding.folderId),
      local: new DexieSyncStore(repo.db),
      reader: repo,
      importExternal: (documentId, parent, bytes) =>
        service.importExternalNote(documentId, parent, bytes),
      lock: webLock(`mindnote-sync-${dbName ?? vault.id}`),
    });
  }

  private async openLinkedVault(
    remoteVault: Vault,
    label: string,
    binding: Binding,
  ): Promise<string> {
    const registry = this.services.registry;
    if (!registry) throw new Error('El almacén temporal no admite destinos externos');
    const entry = await registry.register(label, 'created');
    const { VaultDatabase } = await import('../adapters/indexeddb/db.ts');
    const { DexieVaultRepository } = await import('../adapters/indexeddb/DexieVaultRepository.ts');
    const db = new VaultDatabase(entry.dbName);
    try {
      // Misma identidad de almacén, dispositivo nuevo; el contenido llega al sincronizar.
      const repo = new DexieVaultRepository(db);
      await repo.importContent({
        vault: remoteVault,
        documents: [],
        revisions: [],
        blobs: new Map(),
        controls: [],
      });
      await repo.setDevicePreference(BINDING_KEY, binding);
      await registry.touch(entry.dbName, remoteVault.id);
    } finally {
      db.close();
    }
    return entry.dbName;
  }

  private async bind(binding: Binding): Promise<void> {
    this.binding = binding;
    await this.services.repo.setDevicePreference(BINDING_KEY, binding);
    await this.sync();
  }

  private async authorizeDrive(options: {
    acknowledgedUnencryptedContent: true;
  }): Promise<DriveConnection> {
    this.drive ??= await driveConnection();
    await this.drive.auth.connect(options);
    return this.drive;
  }

  private scheduleSoon(): void {
    if (!this.binding) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), AFTER_CHANGE_MS);
  }

  /** Los permisos de una carpeta se revalidan al reiniciar (§7.1); pedirlos exige un gesto. */
  private async hasPermission(request: boolean): Promise<boolean> {
    if (this.binding?.kind !== 'folder') return false;
    const handle = this.binding.handle as PermissionHandle;
    const query = await handle.queryPermission?.({ mode: 'readwrite' });
    if (query === undefined || query === 'granted') return true;
    if (!request || !handle.requestPermission) return false;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  private make(phase: RemotePhase, message: string | null): RemoteStatus {
    return {
      kind: this.binding?.kind ?? 'folder',
      name: this.binding?.name ?? '',
      phase,
      pending: this.status?.pending ?? 0,
      lastSyncAt: this.status?.lastSyncAt ?? null,
      message,
    };
  }

  private setStatus(status: RemoteStatus | null): void {
    this.status = status;
    this.onStatus(status);
  }
}

function driveBinding(choice: DriveVaultChoice): DriveBinding {
  return {
    kind: 'drive',
    folderId: choice.folderId,
    name: choice.folderName,
    connectedAt: new Date().toISOString(),
  };
}
