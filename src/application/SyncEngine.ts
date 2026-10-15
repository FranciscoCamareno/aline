import { checkRevision } from '../domain/compat.ts';
import type { Revision } from '../domain/revision.ts';
import { versionPruneSchema, type Vault, type VersionPrune } from '../domain/vault.ts';
import { sha256Hex } from '../shared/hash.ts';
import { bodyRole } from './vaultFormat.ts';
import {
  RemoteError,
  type ObjectRole,
  type RemoteStore,
  type SyncCycleResult,
  type SyncEngine as SyncEnginePort,
} from '../ports/RemoteStore.ts';
import type { SyncLocalStore } from '../ports/SyncLocalStore.ts';
import type { StoredBlob, VaultReader } from '../ports/VaultRepository.ts';

/** El destino contiene otro almacén: hay que importarlo o elegir otro (diseño §8.4). */
export class VaultMismatchError extends Error {
  readonly remoteVault: Vault;

  constructor(remoteVault: Vault) {
    super(`El destino contiene otro almacén («${remoteVault.name}»)`);
    this.name = 'VaultMismatchError';
    this.remoteVault = remoteVault;
  }
}

export interface SyncEngineDeps {
  /** Identificador estable del destino (p. ej. «folder»): separa marcas y cursores. */
  target: string;
  remote: RemoteStore;
  local: SyncLocalStore;
  reader: VaultReader;
  /**
   * Importa una edición hecha fuera de la aplicación como revisión `external` cuyo padre es
   * `parentRevisionId` (diseño §8.3). Devuelve el id de la revisión creada, o null.
   */
  importExternal?: (
    documentId: string,
    parentRevisionId: string,
    bytes: Uint8Array,
  ) => Promise<string | null>;
  /** Exclusión entre pestañas (Web Locks); devuelve null si otro sincronizador está activo. */
  lock?: <T>(task: () => Promise<T>) => Promise<T | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** Tamaño de lote al activar revisiones descargadas (limita la memoria del staging). */
const BATCH = 100;
const MAX_ATTEMPTS = 4;

function refsWithRole(rev: Revision): Array<[string, ObjectRole]> {
  const out: Array<[string, ObjectRole]> = [];
  const { body, extensions, assets } = rev.contentRefs;
  const role = bodyRole(rev.metadata.kind);
  if (body && role) out.push([body, role]);
  if (extensions) out.push([extensions, 'extensions']);
  for (const hash of assets) out.push([hash, 'asset']);
  return out;
}

/**
 * Motor de sincronización (diseño §8.1 y §8.2). La precedencia depende de parentIds, no de
 * relojes: lo que llega se añade al grafo y las ramas divergentes quedan como varias cabezas.
 * Nunca borra datos locales por un fallo remoto y nunca avanza el cursor antes de registrar.
 */
export class SyncEngine implements SyncEnginePort {
  private readonly deps: SyncEngineDeps;

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
  }

  async pendingCount(): Promise<number> {
    return (await this.deps.local.unpublishedRevisions(this.deps.target)).length;
  }

  async lastPullAt(): Promise<string | null> {
    return (await this.deps.local.getSyncState(this.deps.target)).lastPullAt;
  }

  async runCycle(): Promise<SyncCycleResult> {
    const run = () => this.cycle();
    if (!this.deps.lock) return run();
    const result = await this.deps.lock(run);
    // Otra pestaña está sincronizando este almacén: no se hace nada en esta.
    return (
      result ?? {
        pulledRevisions: 0,
        pushedRevisions: 0,
        changedDocuments: [],
        conflicts: [],
        rejected: [],
        externalEdits: 0,
      }
    );
  }

  private async cycle(): Promise<SyncCycleResult> {
    const { remote, local, reader, target } = this.deps;
    const now = this.deps.now ?? (() => new Date());
    const vault = await reader.getVault();
    const device = await reader.getDeviceState();

    // 1. Identidad del almacén (§8.4): mismo id se reconcilia; otro id exige importar.
    const remoteVault = await this.retry(() => remote.readVault());
    if (!remoteVault) await this.retry(() => remote.initializeVault(vault));
    else if (remoteVault.id !== vault.id) throw new VaultMismatchError(remoteVault);

    const state = await local.getSyncState(target);
    const changed = new Set<string>();
    // Las retiradas hechas aquí se publican antes de nada y nunca se vuelven a descargar
    // las versiones que retiran (§7.2: aplicar los controles antes de mover revisiones).
    await this.publishControls();
    const localRetired = new Set((await local.listControls()).flatMap((c) => c.revisionIds));
    const rejected: SyncCycleResult['rejected'] = [];
    let pulled = 0;

    // 2. Entrante: controles primero, después revisiones verificadas en staging.
    let cursor = state.cursor;
    for (;;) {
      const page = await this.retry(() => remote.pull(cursor));
      const controls = page.controls
        .map((c) => versionPruneSchema.safeParse(c))
        .filter((r) => r.success)
        .map((r) => r.data);
      if (controls.length) await local.applyControls(controls);
      const retired = new Set([...localRetired, ...controls.flatMap((c) => c.revisionIds)]);

      const known: string[] = [];
      let batch: Revision[] = [];
      let blobs = new Map<string, StoredBlob>();
      const flush = async () => {
        if (batch.length) {
          for (const doc of await local.applyRemote(batch, [...blobs.values()]))
            changed.add(doc.id);
          pulled += batch.length;
          await local.markPublished(
            target,
            'rev',
            batch.map((r) => r.id),
          );
          await local.markPublished(target, 'obj', [
            ...new Set(batch.flatMap((r) => refsWithRole(r).map(([h]) => h))),
          ]);
        }
        batch = [];
        blobs = new Map();
      };

      for (const id of page.revisionIds) {
        if (retired.has(id)) continue;
        if (await local.hasRevision(id)) {
          known.push(id);
          continue;
        }
        const raw = await this.retry(() => remote.getRevision(id));
        const reason = raw === null ? 'invalid-content' : checkRevision(raw);
        // Una versión posterior se acepta: se abrirá en solo lectura (§5).
        if (reason === 'invalid-content' || (raw as Revision).id !== id) {
          rejected.push({ revisionId: id, reason: 'invalid-schema' });
          continue;
        }
        const rev = raw as Revision;
        let complete = true;
        for (const [hash] of refsWithRole(rev)) {
          if (blobs.has(hash) || (await local.hasBlob(hash))) continue;
          const object = await this.retry(() => remote.getObject(hash));
          if (!object) {
            // Subida parcial de otro equipo: se reintentará en el próximo ciclo.
            rejected.push({ revisionId: id, reason: 'missing-object' });
            complete = false;
            break;
          }
          if ((await sha256Hex(object.bytes)) !== hash) {
            rejected.push({ revisionId: id, reason: 'hash-mismatch' });
            complete = false;
            break;
          }
          blobs.set(hash, {
            hash,
            mimeType: object.mimeType,
            byteLength: object.bytes.byteLength,
            bytes: object.bytes,
          });
        }
        if (!complete) continue;
        batch.push(rev);
        if (batch.length >= BATCH) await flush();
      }
      await flush();
      if (known.length) await local.markPublished(target, 'rev', known);
      // El cursor solo avanza cuando todo lo de la página quedó registrado (§8.2, paso 3).
      cursor = page.nextCursor;
      await local.setSyncState(target, { ...state, cursor });
      if (page.complete) break;
    }

    // 3. Ediciones hechas fuera de la aplicación en las copias legibles (§8.3).
    const externalEdits = await this.importExternalEdits(changed);

    // 4. Saliente: objetos primero, revisión al final; operationId = id de la revisión.
    const pending = await local.unpublishedRevisions(target);
    const pushed: string[] = [];
    for (const rev of pending) {
      let ready = true;
      for (const [hash, role] of refsWithRole(rev)) {
        if (await local.isPublished(target, 'obj', hash)) continue;
        const blob = await reader.getBlob(hash);
        if (!blob) {
          ready = false;
          break;
        }
        await this.retry(() =>
          remote.putObject({ hash, role, mimeType: blob.mimeType, bytes: blob.bytes }, rev.id),
        );
        await local.markPublished(target, 'obj', [hash]);
      }
      if (!ready) continue;
      await this.retry(() => remote.publishRevision(rev, rev.id));
      await local.markPublished(target, 'rev', [rev.id]);
      pushed.push(rev.id);
    }
    await local.clearOutbox(pushed);
    await this.publishControls();

    if (pulled || pushed.length || externalEdits) {
      const documents = await reader.listDocuments();
      await this.retry(() => remote.publishIndexes(device.deviceId, documents, vault));
    }

    const at = now().toISOString();
    await local.setSyncState(target, {
      cursor,
      lastPullAt: at,
      lastPushAt: pushed.length ? at : state.lastPushAt,
    });
    const documents = await reader.listDocuments();
    return {
      pulledRevisions: pulled,
      pushedRevisions: pushed.length,
      changedDocuments: [...changed],
      conflicts: documents
        .filter((d) => changed.has(d.id) && d.headRevisionIds.length > 1)
        .map((d) => d.id),
      rejected,
      externalEdits,
    };
  }

  private async publishControls(): Promise<void> {
    const { local, remote, target } = this.deps;
    for (const control of await local.listControls()) {
      const id = `control:${control.id}`;
      if (await local.isPublished(target, 'rev', id)) continue;
      await this.retry(() => remote.publishControl(control as VersionPrune));
      await local.markPublished(target, 'rev', [id]);
    }
  }

  private async importExternalEdits(changed: Set<string>): Promise<number> {
    const { remote, local, reader, target, importExternal } = this.deps;
    if (!importExternal) return 0;
    let imported = 0;
    for (const copy of await this.retry(() => remote.listReadableCopies())) {
      const seen = await local.getObservation(target, copy.path);
      if (seen && seen.lastModified === copy.lastModified) continue;
      const rev = await reader.getRevision(copy.revisionId);
      if (rev?.documentId !== copy.documentId) continue; // aún no conocida: próximo ciclo
      const bytes = await this.retry(() => copy.read());
      const hash = await sha256Hex(bytes);
      if (hash === seen?.hash || hash === rev.contentRefs.body) {
        await local.setObservation(target, copy.path, {
          ...seen,
          hash,
          lastModified: copy.lastModified,
        });
        continue;
      }
      // Una segunda edición del mismo archivo desciende de la importada antes.
      const parent = seen?.revisionId ?? copy.revisionId;
      const created = await importExternal(copy.documentId, parent, bytes);
      await local.setObservation(target, copy.path, {
        hash,
        lastModified: copy.lastModified,
        ...(created
          ? { revisionId: created }
          : seen?.revisionId
            ? { revisionId: seen.revisionId }
            : {}),
      });
      if (created) {
        imported++;
        changed.add(copy.documentId);
      }
    }
    return imported;
  }

  /** Reintentos con backoff exponencial y jitter; respeta Retry-After (§8.2). */
  private async retry<T>(task: () => Promise<T>): Promise<T> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    for (let attempt = 1; ; attempt++) {
      try {
        return await task();
      } catch (error) {
        const retriable =
          error instanceof RemoteError && (error.kind === 'transient' || error.kind === 'offline');
        if (!retriable || attempt >= MAX_ATTEMPTS) throw error;
        const delay =
          error.retryAfter !== null
            ? error.retryAfter * 1000
            : 400 * 2 ** (attempt - 1) + Math.random() * 250;
        await sleep(delay);
      }
    }
  }
}
