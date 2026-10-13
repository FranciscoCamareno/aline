import { DexieSyncStore } from '../adapters/indexeddb/DexieSyncStore.ts';
import { SyncEngine, VaultMismatchError } from '../application/SyncEngine.ts';
import type { DriveEncryptionChoice } from '../domain/encryption.ts';
import type { Vault } from '../domain/vault.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { RemoteError } from '../ports/RemoteStore.ts';
import type { VaultKeys } from '../shared/crypto.ts';
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
export { generateRecoveryCode, WrongSecretError } from '../shared/crypto.ts';

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
  /** Modo de la carpeta (diseño §13.1); lo decide la carpeta, no el equipo. */
  encrypted: boolean;
  connectedAt: string;
  /** Carpeta anterior mientras se completa un cambio de modo; se marca al terminar. */
  supersedes?: string;
  /** Carpeta anterior ya sustituida que el propietario aún puede mover a la papelera. */
  previousFolderId?: string;
}
type Binding = FolderBinding | DriveBinding;

export type RemotePhase =
  | 'idle'
  | 'syncing'
  | 'ok'
  | 'pending'
  | 'needs-permission'
  | 'needs-auth'
  | 'needs-key'
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
  /** Solo Drive: la carpeta está cifrada de extremo a extremo. */
  encrypted: boolean;
  /** Solo Drive: hay una carpeta anterior (otro modo) que se puede mover a la papelera. */
  previousFolder: boolean;
}

const BINDING_KEY = 'binding';
const keysPref = (folderId: string) => `driveKeys:${folderId}`;
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

export type DriveConnectResult =
  | { connected: true; notice?: 'existing-plain' | 'existing-encrypted' }
  | { choices: DriveVaultChoice[] };

/**
 * Sincronización con una carpeta local (plan 4.2) o con Google Drive (plan 4.5), cifrado o no
 * (diseño §13.1): el almacén sigue en IndexedDB y el destino recibe el formato abierto.
 * Sincroniza al abrir, al recuperar el foco, tras los cambios y cada minuto mientras la
 * aplicación está visible; nunca con la aplicación cerrada (§1.2).
 */
export class SyncRuntime {
  private readonly services: AppServices;
  private readonly onStatus: (status: RemoteStatus | null) => void;
  private readonly onRemoteChanges: (documentIds: string[]) => void;
  private binding: Binding | null = null;
  /** Conexión con Google (token solo en memoria): se crea al conectar, nunca al arrancar. */
  private drive: DriveConnection | null = null;
  /** Clave del almacén cifrado (no extraíble), también guardada en este dispositivo. */
  private keys: VaultKeys | null = null;
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
   * Tras elegir el modo y aceptar su aviso: carga los módulos de Drive y GIS, sin ventanas.
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
   * Conecta Google Drive con el modo elegido (CA-27, diseño §13.1). Debe llamarse desde un gesto
   * del usuario: abre la ventana de Google. Si Drive ya tiene este almacén, se usa su carpeta y
   * su modo; si no tiene ninguno, se crea en el modo elegido; si solo tiene otros, se devuelven
   * para que el propietario elija (nunca se mezclan).
   */
  async connectDrive(choice: DriveEncryptionChoice): Promise<DriveConnectResult> {
    const drive = await this.authorizeDrive();
    const vaults = await drive.listVaults();
    const same = vaults.find((v) => v.vault.id === this.services.vault.id);
    if (same) {
      let keys: VaultKeys | null = null;
      if (same.encrypted && choice.mode === 'encrypted') {
        keys = await drive.unlock(same.folderId, choice.password).catch(() => null);
      }
      await this.bind(driveBinding(same), keys);
      if (same.encrypted && choice.mode === 'plain')
        return { connected: true, notice: 'existing-encrypted' };
      if (!same.encrypted && choice.mode === 'encrypted')
        return { connected: true, notice: 'existing-plain' };
      return { connected: true };
    }
    if (vaults.length) return { choices: vaults };
    return this.createDriveVault(choice);
  }

  /** Crea en Drive la carpeta de ESTE almacén en el modo elegido, aunque la cuenta tenga otros. */
  async createDriveVault(choice: DriveEncryptionChoice): Promise<{ connected: true }> {
    const drive = this.requireDrive();
    const { entry, keys } = await drive.createVault(this.services.vault, choice);
    await this.bind(driveBinding(entry), keys);
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
   * Desbloquea un almacén cifrado en este equipo con la contraseña o el código de recuperación
   * (WrongSecretError si no corresponde). La clave queda guardada en este dispositivo.
   */
  async unlockDrive(secret: string): Promise<void> {
    const binding = this.driveBinding();
    const keys = await this.requireDrive().unlock(binding.folderId, secret);
    await this.storeKeys(binding.folderId, keys);
    await this.sync();
  }

  /**
   * Cambia el modo (cifrar o quitar el cifrado): crea una carpeta nueva en el otro modo y sube
   * todo el almacén. La carpeta antigua solo se marca como sustituida cuando la nueva está
   * completa; después el propietario decide si moverla a la papelera (diseño §13.1).
   */
  async switchDriveMode(choice: DriveEncryptionChoice): Promise<void> {
    const binding = this.driveBinding();
    if ((choice.mode === 'encrypted') === binding.encrypted) return;
    const drive = this.requireDrive();
    const { entry, keys } = await drive.createVault(this.services.vault, choice);
    await this.bind({ ...driveBinding(entry), supersedes: binding.folderId }, keys);
  }

  /** Cambia la contraseña sin volver a subir nada: solo se reenvuelve la clave. */
  async changeDrivePassword(current: string, next: string): Promise<void> {
    await this.requireDrive().replaceSecret(
      this.driveBinding().folderId,
      current,
      'password',
      next,
    );
  }

  /** Sustituye el código de recuperación (el anterior deja de servir). */
  async replaceRecoveryCode(current: string, code: string): Promise<void> {
    await this.requireDrive().replaceSecret(
      this.driveBinding().folderId,
      current,
      'recovery',
      code,
    );
  }

  /** Mueve a la papelera de Drive la carpeta anterior a un cambio de modo. */
  async trashPreviousDriveFolder(): Promise<void> {
    const binding = this.driveBinding();
    if (!binding.previousFolderId) return;
    await this.requireDrive().trashFolder(binding.previousFolderId);
    await this.forgetPreviousDriveFolder();
  }

  /** Conserva la carpeta anterior (ya no se usa) y deja de ofrecer moverla a la papelera. */
  async forgetPreviousDriveFolder(): Promise<void> {
    const rest: DriveBinding = { ...this.driveBinding() };
    delete rest.previousFolderId;
    await this.saveBinding(rest);
    this.setStatus(this.make(this.status?.phase ?? 'ok', null));
  }

  /**
   * Pide de nuevo el permiso o la autorización; requiere un gesto del usuario (p. ej. pulsar
   * «Reconectar»). Para Drive, el modo y su aviso ya se aceptaron al conectar este almacén.
   */
  async reconnect(): Promise<void> {
    if (this.binding?.kind === 'drive') {
      await this.authorizeDrive();
      return this.sync();
    }
    if (await this.hasPermission(true)) await this.sync();
  }

  /** Desconectar no borra nada: ni el almacén local ni la carpeta o Drive (§8.4). */
  async disconnect(): Promise<void> {
    if (this.binding?.kind === 'drive') {
      await this.services.repo.setDevicePreference(keysPref(this.binding.folderId), null);
      await this.drive?.auth.disconnect().catch(() => undefined);
      this.drive = null;
      this.keys = null;
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
    if (binding.kind === 'drive') {
      if (!this.drive?.auth.getAccessToken()) {
        this.setStatus(this.make('needs-auth', null));
        return;
      }
      if (binding.encrypted && !(await this.loadKeys(binding.folderId))) {
        this.setStatus(this.make('needs-key', null));
        return;
      }
    }
    this.setStatus(this.make('syncing', null));
    const engine = this.engine(binding);
    try {
      const result = await engine.runCycle();
      const pending = await engine.pendingCount();
      if (binding.kind === 'drive' && binding.supersedes && pending === 0) {
        // La carpeta nueva está completa: los demás equipos se trasladarán a ella.
        await this.requireDrive().markSuperseded(binding.supersedes, binding.folderId);
        await this.services.repo.setDevicePreference(keysPref(binding.supersedes), null);
        const { supersedes, ...rest } = binding;
        await this.saveBinding({ ...rest, previousFolderId: supersedes });
        logDiagnostic('info', 'drive-mode-changed', binding.encrypted ? 'cifrado' : 'sin cifrar');
      }
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
      if (
        binding.kind === 'drive' &&
        error instanceof RemoteError &&
        error.kind === 'not-found' &&
        (await this.relocateDrive(binding))
      ) {
        return;
      }
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

  /**
   * La carpeta de Drive se sustituyó (otro equipo cambió el modo) o se borró: si la cuenta tiene
   * otra carpeta de este mismo almacén, se pasa a ella; si está cifrada, se pedirá la clave.
   */
  private async relocateDrive(binding: DriveBinding): Promise<boolean> {
    let vaults: DriveVaultChoice[];
    try {
      vaults = await this.requireDrive().listVaults();
    } catch {
      return false;
    }
    const next = vaults.find(
      (v) => v.vault.id === this.services.vault.id && v.folderId !== binding.folderId,
    );
    if (!next) return false;
    await this.saveBinding(driveBinding(next));
    // La clave de la carpeta anterior ya no sirve para nada en este equipo.
    await this.services.repo.setDevicePreference(keysPref(binding.folderId), null);
    this.keys = null;
    logDiagnostic('info', 'drive-relocated', next.encrypted ? 'cifrado' : 'sin cifrar');
    this.again = true; // se sincroniza (o se pide la clave) en cuanto termine este ciclo
    return true;
  }

  private engine(binding: Binding): SyncEngine {
    const { repo, service, vault, dbName } = this.services;
    return new SyncEngine({
      // Marcas de publicación y cursores separados por destino (y por carpeta de Drive).
      target: binding.kind === 'folder' ? 'folder' : `drive:${binding.folderId}`,
      remote:
        binding.kind === 'folder'
          ? folderRemote(binding.handle)
          : this.requireDrive().remote(binding.folderId, vault.id, this.keys),
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

  private async bind(binding: Binding, keys: VaultKeys | null = null): Promise<void> {
    if (binding.kind === 'drive') {
      this.keys = null;
      if (keys) await this.storeKeys(binding.folderId, keys);
    }
    await this.saveBinding(binding);
    await this.sync();
  }

  private async saveBinding(binding: Binding): Promise<void> {
    this.binding = binding;
    await this.services.repo.setDevicePreference(BINDING_KEY, binding);
  }

  /** CryptoKey no extraíble: IndexedDB la guarda, pero ni la app puede leer sus bytes. */
  private async storeKeys(folderId: string, keys: VaultKeys): Promise<void> {
    this.keys = keys;
    await this.services.repo.setDevicePreference(keysPref(folderId), keys);
  }

  private async loadKeys(folderId: string): Promise<boolean> {
    this.keys ??=
      ((await this.services.repo.getDevicePreference(keysPref(folderId))) as VaultKeys | null) ??
      null;
    return this.keys !== null;
  }

  private async authorizeDrive(): Promise<DriveConnection> {
    this.drive ??= await driveConnection();
    await this.drive.auth.connect();
    return this.drive;
  }

  private requireDrive(): DriveConnection {
    if (!this.drive?.auth.getAccessToken()) {
      throw new RemoteError('auth', 'Necesita autorización de Google');
    }
    return this.drive;
  }

  private driveBinding(): DriveBinding {
    if (this.binding?.kind !== 'drive') throw new Error('El almacén no está conectado a Drive');
    return this.binding;
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
    const drive = this.binding?.kind === 'drive' ? this.binding : null;
    return {
      kind: this.binding?.kind ?? 'folder',
      name: this.binding?.name ?? '',
      phase,
      pending: this.status?.pending ?? 0,
      lastSyncAt: this.status?.lastSyncAt ?? null,
      message,
      encrypted: drive?.encrypted ?? false,
      previousFolder: Boolean(drive?.previousFolderId),
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
    encrypted: choice.encrypted,
    connectedAt: new Date().toISOString(),
  };
}
