import { DexieSyncStore } from '../adapters/indexeddb/DexieSyncStore.ts';
import { SyncEngine, VaultMismatchError } from '../application/SyncEngine.ts';
import type { Vault } from '../domain/vault.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { RemoteError } from '../ports/RemoteStore.ts';
import { folderRemote, readFolderVault } from './composition/remotes.ts';
import { logDiagnostic } from './runtime.ts';
import type { AppServices } from './services.ts';

/** Destino conectado al almacén en este dispositivo (plan 4.1). Drive llegará con 4.4–4.6. */
interface FolderBinding {
  kind: 'folder';
  handle: FileSystemDirectoryHandle;
  name: string;
  connectedAt: string;
}

export type RemotePhase =
  'idle' | 'syncing' | 'ok' | 'pending' | 'needs-permission' | 'mismatch' | 'unavailable' | 'error';

export interface RemoteStatus {
  kind: 'folder';
  name: string;
  phase: RemotePhase;
  pending: number;
  lastSyncAt: string | null;
  message: string | null;
}

const BINDING_KEY = 'binding';
const TARGET = 'folder';
const INTERVAL_MS = 60_000;
const AFTER_CHANGE_MS = 3_000;

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export function folderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
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
 * Sincronización con una carpeta local (plan 4.2): el almacén sigue en IndexedDB y la carpeta
 * recibe el formato abierto. Sincroniza al abrir, al recuperar el foco, tras los cambios y cada
 * minuto mientras la aplicación está visible; nunca con la aplicación cerrada (§1.2).
 */
export class SyncRuntime {
  private readonly services: AppServices;
  private readonly onStatus: (status: RemoteStatus | null) => void;
  private readonly onRemoteChanges: (documentIds: string[]) => void;
  private binding: FolderBinding | null = null;
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
      ((await this.services.repo.getDevicePreference(BINDING_KEY)) as FolderBinding | null) ?? null;
    this.unsubscribe = this.services.service.onCommit(() => this.scheduleSoon());
    document.addEventListener('visibilitychange', this.onVisible);
    this.interval = setInterval(() => {
      if (document.visibilityState === 'visible') void this.sync();
    }, INTERVAL_MS);
    if (!this.binding) return this.setStatus(null);
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
    await this.bind(handle);
    return { connected: true };
  }

  /** Abre en este navegador el almacén que contiene una carpeta: almacén nuevo enlazado a ella. */
  async openVaultFromFolder(
    handle: FileSystemDirectoryHandle,
    remoteVault: Vault,
  ): Promise<string> {
    const registry = this.services.registry;
    if (!registry) throw new Error('El almacén temporal no admite carpetas');
    const entry = await registry.register(`${remoteVault.name} (${handle.name})`, 'created');
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
      await repo.setDevicePreference(BINDING_KEY, {
        kind: 'folder',
        handle,
        name: handle.name,
        connectedAt: new Date().toISOString(),
      } satisfies FolderBinding);
      await registry.touch(entry.dbName, remoteVault.id);
    } finally {
      db.close();
    }
    return entry.dbName;
  }

  /** Pide de nuevo el permiso (requiere un gesto del usuario, p. ej. pulsar «Reconectar»). */
  async reconnect(): Promise<void> {
    if (await this.hasPermission(true)) await this.sync();
  }

  /** Desconectar no borra nada: ni el almacén local ni la carpeta (§8.4). */
  async disconnect(): Promise<void> {
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
    if (!(await this.hasPermission(false))) {
      this.setStatus(this.make('needs-permission', null));
      return;
    }
    this.setStatus(this.make('syncing', null));
    const engine = this.engine(binding.handle);
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
          `recibidas=${result.pulledRevisions} enviadas=${result.pushedRevisions} externas=${result.externalEdits} conflictos=${result.conflicts.length}`,
        );
      }
      if (result.changedDocuments.length) this.onRemoteChanges(result.changedDocuments);
    } catch (error) {
      logDiagnostic('error', 'sync-failed', describeError(error));
      if (error instanceof VaultMismatchError) {
        this.setStatus(this.make('mismatch', error.message));
      } else if (error instanceof RemoteError && error.kind === 'permission') {
        this.setStatus(this.make('needs-permission', error.message));
      } else if (error instanceof RemoteError && error.kind === 'not-found') {
        this.setStatus(this.make('unavailable', error.message));
      } else {
        this.setStatus(this.make('error', error instanceof Error ? error.message : String(error)));
      }
    }
  }

  private engine(handle: FileSystemDirectoryHandle): SyncEngine {
    const { repo, service, vault, dbName } = this.services;
    return new SyncEngine({
      target: TARGET,
      remote: folderRemote(handle),
      local: new DexieSyncStore(repo.db),
      reader: repo,
      importExternal: (documentId, parent, bytes) =>
        service.importExternalNote(documentId, parent, bytes),
      lock: webLock(`mindnote-sync-${dbName ?? vault.id}`),
    });
  }

  private async bind(handle: FileSystemDirectoryHandle): Promise<void> {
    this.binding = {
      kind: 'folder',
      handle,
      name: handle.name,
      connectedAt: new Date().toISOString(),
    };
    await this.services.repo.setDevicePreference(BINDING_KEY, this.binding);
    await this.sync();
  }

  private scheduleSoon(): void {
    if (!this.binding) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), AFTER_CHANGE_MS);
  }

  /** Los permisos de una carpeta se revalidan al reiniciar (§7.1); pedirlos exige un gesto. */
  private async hasPermission(request: boolean): Promise<boolean> {
    const handle = this.binding?.handle as PermissionHandle | undefined;
    if (!handle) return false;
    const query = await handle.queryPermission?.({ mode: 'readwrite' });
    if (query === undefined || query === 'granted') return true;
    if (!request || !handle.requestPermission) return false;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  private make(phase: RemotePhase, message: string | null): RemoteStatus {
    return {
      kind: 'folder',
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
