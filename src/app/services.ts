import { VaultDatabase } from '../adapters/indexeddb/db.ts';
import { DexieDiagnostics } from '../adapters/indexeddb/DexieDiagnostics.ts';
import { DexieVaultRepository } from '../adapters/indexeddb/DexieVaultRepository.ts';
import { VaultRegistry } from '../adapters/indexeddb/registry.ts';
import { requestPersistentStorage, type StorageReport } from '../adapters/indexeddb/storage.ts';
import { VaultService } from '../application/VaultService.ts';
import { newId } from '../domain/ids.ts';
import type { DeviceState, Vault } from '../domain/vault.ts';
import { describeError, type Diagnostics } from '../ports/Diagnostics.ts';
import { setSha256Implementation } from '../shared/hash.ts';
import { createHashWorkerClient, type HashWorkerClient } from '../workers/hashClient.ts';
import { logDiagnostic, setDiagnostics } from './runtime.ts';

/** Composición de dependencias del núcleo local. Drive y carpeta no se conectan todavía. */
export interface AppServices {
  vault: Vault;
  /** Base IndexedDB del almacén abierto; null en el almacén temporal. */
  dbName: string | null;
  repo: DexieVaultRepository;
  registry: VaultRegistry | null;
  device: DeviceState;
  service: VaultService;
  diagnostics: Diagnostics;
  /** Persistencia solicitada en segundo plano; consultar antes de mostrar avisos de cuota. */
  storage: Promise<StorageReport>;
  /** Almacén en memoria (FA-01b): se pierde al cerrar la pestaña. */
  temporary: boolean;
  hashWorker: HashWorkerClient | null;
}

const DEFAULT_VAULT_NAME = 'Mi almacén';

const pending = new Map<'persistent' | 'temporary', Promise<AppServices>>();
let globalHandlersInstalled = false;

function installGlobalErrorCapture(): void {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  window.addEventListener('error', (event) => {
    logDiagnostic('error', 'uncaught-error', describeError(event.error ?? event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    logDiagnostic('error', 'unhandled-rejection', describeError(event.reason));
  });
}

async function openDatabase(temporary: boolean, dbName: string | null): Promise<VaultDatabase> {
  if (!temporary) return new VaultDatabase(dbName ?? undefined);
  // Solo se carga si el navegador no deja usar IndexedDB.
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  return new VaultDatabase(`mindnote-temporal-${newId()}`, { indexedDB, IDBKeyRange });
}

/**
 * Primera apertura (diseño §1.2): crea el almacén y un lienzo vacío sin pedir cuenta ni carpeta.
 * Se memoiza para que el doble montaje de StrictMode no cree dos lienzos.
 */
export function bootstrap(
  firstCanvasTitle: string,
  { temporary = false }: { temporary?: boolean } = {},
): Promise<AppServices> {
  const mode = temporary ? 'temporary' : 'persistent';
  let services = pending.get(mode);
  if (!services) {
    services = (async () => {
      // Almacén activo según el registro (plan 2.2); el original es «mindnote-vault».
      const registry = temporary ? null : new VaultRegistry();
      await registry?.ensureDefault(DEFAULT_VAULT_NAME);
      const dbName = registry ? await registry.active() : null;
      const entry = dbName ? (await registry!.list()).find((v) => v.dbName === dbName) : undefined;
      const db = await openDatabase(temporary, dbName);
      const repo = new DexieVaultRepository(db);
      const { vault, device } = await repo.init(entry?.name ?? DEFAULT_VAULT_NAME);
      if (registry && dbName) await registry.touch(dbName, vault.id);
      const diagnostics = new DexieDiagnostics(db);
      setDiagnostics(diagnostics);
      installGlobalErrorCapture();

      const hashWorker = typeof Worker === 'undefined' ? null : createHashWorkerClient();
      setSha256Implementation(hashWorker?.sha256 ?? null);

      const service = new VaultService(repo);
      if ((await service.listDocuments()).length === 0) {
        await service.createDocument('canvas', firstCanvasTitle);
      }
      diagnostics.record(
        'info',
        'app-start',
        `v${__APP_VERSION__}${temporary ? ' (temporal)' : ''}`,
      );

      // No bloquea la primera captura.
      const storage: Promise<StorageReport> = temporary
        ? Promise.resolve({ persisted: false, usage: null, quota: null })
        : requestPersistentStorage().then((report) => {
            diagnostics.record(
              'info',
              'storage-report',
              `persisted=${String(report.persisted)} usage=${String(report.usage)} quota=${String(report.quota)}`,
            );
            return report;
          });
      return {
        vault,
        dbName,
        repo,
        registry,
        device,
        service,
        diagnostics,
        storage,
        temporary,
        hashWorker,
      };
    })();
    // Un intento fallido no se memoiza: «Reintentar» debe volver a abrir.
    services.catch(() => pending.delete(mode));
    pending.set(mode, services);
  }
  return services;
}
