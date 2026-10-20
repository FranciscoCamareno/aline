import { DexieSyncStore } from '../adapters/indexeddb/DexieSyncStore.ts';
import { SyncEngine, VaultMismatchError } from '../application/SyncEngine.ts';
import type { DriveEncryptionChoice } from '../domain/encryption.ts';
import type { Vault } from '../domain/vault.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { RemoteError, type RemoteErrorCode } from '../ports/RemoteStore.ts';
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
  /**
   * Drive: la carpeta cifrada se sustituyó por otra SIN cifrar (otro equipo quitó el cifrado).
   * No se publica nada hasta que el propietario lo acepte o vuelva a cifrar (auditoría H01).
   */
  | 'needs-confirm'
  | 'mismatch'
  | 'unavailable'
  | 'error';

/** Causa de un fallo de sincronización; `unknown` cuando no viene de un destino remoto. */
export type RemoteProblem = RemoteErrorCode | 'unknown';

export interface RemoteStatus {
  kind: 'folder' | 'drive';
  name: string;
  phase: RemotePhase;
  pending: number;
  lastSyncAt: string | null;
  /** Causa del último fallo, traducida en la interfaz (`sync.errors.<código>`); nunca texto. */
  problem: RemoteProblem | null;
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
  | { connected: true; notice?: 'existing-encrypted' }
  /**
   * Se eligió cifrar, pero Drive ya tiene este almacén SIN cifrar: no se ha publicado nada; el
   * propietario decide entre crear una carpeta cifrada nueva o usar la existente (auditoría H01).
   */
  | { existingPlain: DriveVaultChoice }
  | { choices: DriveVaultChoice[] };

/** Saltos máximos al seguir `supersededBy` (varios cambios de modo seguidos). */
const MAX_RELOCATION_HOPS = 8;

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
  /** Carpeta sin cifrar que sustituyó a la cifrada de este equipo, pendiente de aceptar. */
  private pendingPlainRelocation: DriveVaultChoice | null = null;
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
   * su modo, salvo que se haya elegido cifrar y la carpeta no lo esté: entonces no se publica
   * nada y decide el propietario (auditoría H01). Si no tiene ninguno, se crea en el modo
   * elegido; si solo tiene otros, se devuelven para que el propietario elija (nunca se mezclan).
   */
  async connectDrive(choice: DriveEncryptionChoice): Promise<DriveConnectResult> {
    const drive = await this.authorizeDrive();
    const vaults = await drive.listVaults();
    const same = vaults.find((v) => v.vault.id === this.services.vault.id);
    if (same) {
      // Elegir cifrar nunca acaba publicando en claro sin una confirmación explícita.
      if (!same.encrypted && choice.mode === 'encrypted') return { existingPlain: same };
      let keys: VaultKeys | null = null;
      if (same.encrypted && choice.mode === 'encrypted') {
        keys = await drive.unlock(same.folderId, choice.password).catch(() => null);
      }
      await this.bind(driveBinding(same), keys);
      if (same.encrypted && choice.mode === 'plain')
        return { connected: true, notice: 'existing-encrypted' };
      return { connected: true };
    }
    if (vaults.length) return { choices: vaults };
    return this.createDriveVault(choice);
  }

  /**
   * Usa la carpeta SIN cifrar que ya existe en Drive, aceptado expresamente por el propietario
   * tras elegir cifrar (respuesta `existingPlain` de connectDrive).
   */
  async useExistingPlainDrive(existing: DriveVaultChoice): Promise<void> {
    if (existing.encrypted || existing.vault.id !== this.services.vault.id) {
      throw new Error('La carpeta elegida no es la copia sin cifrar de este almacén');
    }
    this.requireDrive();
    await this.bind(driveBinding(existing));
  }

  /**
   * Crea en Drive la carpeta de ESTE almacén en el modo elegido, aunque la cuenta tenga otros.
   * Con `supersedes`, la carpeta indicada (otra copia de este almacén) se marcará como sustituida
   * cuando la nueva esté completa, como en un cambio de modo.
   */
  async createDriveVault(
    choice: DriveEncryptionChoice,
    supersedes?: string,
  ): Promise<{ connected: true }> {
    const drive = this.requireDrive();
    const { entry, keys } = await drive.createVault(this.services.vault, choice);
    await this.bind(
      supersedes ? { ...driveBinding(entry), supersedes } : driveBinding(entry),
      keys,
    );
    return { connected: true };
  }

  /**
   * Fase `needs-confirm`: el propietario acepta pasar a la carpeta SIN cifrar que sustituyó a
   * la cifrada. Solo a partir de aquí se publica en ella lo pendiente de este equipo.
   */
  async acceptPlainRelocation(): Promise<void> {
    const next = this.pendingPlainRelocation;
    if (!next) return;
    const binding = this.driveBinding();
    this.pendingPlainRelocation = null;
    await this.services.repo.setDevicePreference(keysPref(binding.folderId), null);
    logDiagnostic('info', 'drive-relocated', 'sin cifrar (aceptado)');
    await this.bind(driveBinding(next));
  }

  /**
   * Fase `needs-confirm`, alternativa: se mantiene el cifrado creando una carpeta cifrada nueva
   * (contraseña y código nuevos) que sustituirá a la carpeta sin cifrar cuando esté completa.
   */
  async reencryptAfterPlainRelocation(choice: DriveEncryptionChoice): Promise<void> {
    const next = this.pendingPlainRelocation;
    if (!next || choice.mode !== 'encrypted') return;
    const binding = this.driveBinding();
    this.pendingPlainRelocation = null;
    await this.services.repo.setDevicePreference(keysPref(binding.folderId), null);
    await this.createDriveVault(choice, next.folderId);
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
  /**
   * Para Drive devuelve si Google confirmó la revocación del permiso (auditoría H07): la
   * desvinculación local se hace siempre, pero no equivale a retirar el permiso en la cuenta.
   */
  async disconnect(): Promise<{ revoked: boolean } | null> {
    let result: { revoked: boolean } | null = null;
    if (this.binding?.kind === 'drive') {
      await this.services.repo.setDevicePreference(keysPref(this.binding.folderId), null);
      let revoked = false;
      try {
        if (this.drive) {
          await this.drive.auth.disconnect();
          revoked = true;
        }
      } catch (error) {
        logDiagnostic('warn', 'drive-revoke-failed', describeError(error));
      }
      result = { revoked };
      this.drive = null;
      this.keys = null;
      this.pendingPlainRelocation = null;
    }
    this.binding = null;
    await this.services.repo.setDevicePreference(BINDING_KEY, null);
    this.setStatus(null);
    return result;
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
        this.setStatus(this.make('mismatch', null));
      } else if (error instanceof RemoteError && error.kind === 'auth') {
        this.setStatus(this.make('needs-auth', error.code));
      } else if (error instanceof RemoteError && error.kind === 'permission') {
        this.setStatus(
          this.make(binding.kind === 'drive' ? 'error' : 'needs-permission', error.code),
        );
      } else if (error instanceof RemoteError && error.kind === 'not-found') {
        this.setStatus(this.make('unavailable', error.code));
      } else {
        this.setStatus(this.make('error', error instanceof RemoteError ? error.code : 'unknown'));
      }
    }
  }

  /**
   * La carpeta de Drive se sustituyó (otro equipo cambió el modo) o se borró. Si la carpeta
   * indica su sustituta (`supersededBy`, siguiendo la cadena), solo se acepta esa; si no lo
   * indica, solo si la cuenta tiene exactamente otra carpeta de este almacén. Si la nueva está
   * cifrada, se pedirá la clave; si deja de estar cifrada, no se publica nada hasta que el
   * propietario lo confirme (auditoría H01).
   */
  private async relocateDrive(binding: DriveBinding): Promise<boolean> {
    let vaults: DriveVaultChoice[];
    let successor: string | null;
    try {
      const drive = this.requireDrive();
      vaults = (await drive.listVaults()).filter(
        (v) => v.vault.id === this.services.vault.id && v.folderId !== binding.folderId,
      );
      successor = await drive.successorOf(binding.folderId);
      for (let hop = 0; successor && hop < MAX_RELOCATION_HOPS; hop++) {
        if (vaults.some((v) => v.folderId === successor)) break;
        successor = await drive.successorOf(successor);
      }
    } catch {
      return false;
    }
    const next = successor
      ? vaults.find((v) => v.folderId === successor)
      : vaults.length === 1
        ? vaults[0]
        : undefined;
    if (!next) return false;
    if (binding.encrypted && !next.encrypted) {
      this.pendingPlainRelocation = next;
      logDiagnostic('warn', 'drive-relocation-to-plain-blocked', 'pendiente de confirmar');
      this.setStatus(this.make('needs-confirm', null));
      return true;
    }
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
      throw new RemoteError('auth', 'auth-required');
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

  private make(phase: RemotePhase, problem: RemoteProblem | null): RemoteStatus {
    const drive = this.binding?.kind === 'drive' ? this.binding : null;
    return {
      kind: this.binding?.kind ?? 'folder',
      name: this.binding?.name ?? '',
      phase,
      pending: this.status?.pending ?? 0,
      lastSyncAt: this.status?.lastSyncAt ?? null,
      problem,
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
