import { DomainError } from '../../domain/errors.ts';
import { newId, type Uuid } from '../../domain/ids.ts';
import {
  documentExtras,
  REVISION_SCHEMA_VERSION,
  revisionSchema,
  sameHeads,
  type DocumentRecord,
  type Revision,
} from '../../domain/revision.ts';
import { VAULT_FORMAT_VERSION, type DeviceState, type Vault } from '../../domain/vault.ts';
import type {
  CommitInput,
  CommitResult,
  HistoryEntry,
  PurgeResult,
  ResolveInput,
  StoredBlob,
  VaultContent,
  VaultReader,
  VaultRepository,
  VaultSnapshot,
  VersionSpace,
} from '../../ports/VaultRepository.ts';
import type { VaultDatabase } from './db.ts';

const VAULT_KEY = 'vault';
const DEVICE_KEY = 'device';

function isQuotaError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === 'object' && 'name' in current && current.name === 'QuotaExceededError') {
      return true;
    }
    current = typeof current === 'object' && 'inner' in current ? current.inner : undefined;
  }
  return false;
}

function mapStorageError(error: unknown): never {
  if (error instanceof DomainError) throw error;
  if (isQuotaError(error)) {
    throw new DomainError('quota-exceeded', 'No queda espacio de almacenamiento', { cause: error });
  }
  throw new DomainError('storage-failure', 'Falló la escritura local', { cause: error });
}

export class DexieVaultRepository implements VaultRepository, VaultReader {
  readonly db: VaultDatabase;
  private readonly now: () => Date;

  constructor(db: VaultDatabase, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  /** Primera apertura (diseño §1.2): crea almacén y dispositivo sin pedir nada al usuario. */
  async init(vaultName = 'Mi almacén'): Promise<{ vault: Vault; device: DeviceState }> {
    return this.db.transaction('rw', this.db.deviceSettings, async () => {
      let vault = (await this.db.deviceSettings.get(VAULT_KEY))?.value as Vault | undefined;
      if (!vault) {
        vault = {
          id: newId(),
          formatVersion: VAULT_FORMAT_VERSION,
          name: vaultName,
          createdAt: this.now().toISOString(),
        };
        await this.db.deviceSettings.put({ key: VAULT_KEY, value: vault });
      } else if (vault.formatVersion !== VAULT_FORMAT_VERSION) {
        throw new DomainError(
          'unsupported-version',
          `Formato de almacén ${String(vault.formatVersion)} no soportado`,
        );
      }
      let device = (await this.db.deviceSettings.get(DEVICE_KEY))?.value as DeviceState | undefined;
      if (!device) {
        device = { deviceId: newId(), localGeneration: 0, syncCursor: null, remoteFileMap: {} };
        await this.db.deviceSettings.put({ key: DEVICE_KEY, value: device });
      }
      return { vault, device };
    });
  }

  async getVault(): Promise<Vault> {
    const entry = await this.db.deviceSettings.get(VAULT_KEY);
    if (!entry) throw new DomainError('not-found', 'Almacén no inicializado');
    return entry.value as Vault;
  }

  async getDeviceState(): Promise<DeviceState> {
    const entry = await this.db.deviceSettings.get(DEVICE_KEY);
    if (!entry) throw new DomainError('not-found', 'Dispositivo no inicializado');
    return entry.value as DeviceState;
  }

  listDocuments(): Promise<DocumentRecord[]> {
    return this.db.documents.orderBy('updatedAt').reverse().toArray();
  }

  getDocument(documentId: Uuid): Promise<DocumentRecord | undefined> {
    return this.db.documents.get(documentId);
  }

  getRevision(revisionId: Uuid): Promise<Revision | undefined> {
    return this.db.revisions.get(revisionId);
  }

  getBlob(hash: string): Promise<StoredBlob | undefined> {
    return this.db.blobs.get(hash);
  }

  async getDevicePreference(key: string): Promise<unknown> {
    return (await this.db.deviceSettings.get(`pref:${key}`))?.value;
  }

  async setDevicePreference(key: string, value: unknown): Promise<void> {
    await this.db.deviceSettings.put({ key: `pref:${key}`, value });
  }

  async getHeads(documentId: Uuid): Promise<Revision[]> {
    const doc = await this.db.documents.get(documentId);
    if (!doc) return [];
    const heads = await this.db.revisions.bulkGet(doc.headRevisionIds);
    return heads.filter((r): r is Revision => r !== undefined);
  }

  /**
   * Guardado local (diseño §7.1, paso 4): en una sola transacción inserta blobs, revisión,
   * cabezas, entrada de historial y operación outbox. Si otra pestaña avanzó la cabeza,
   * no sobrescribe: conserva el cambio como rama y devuelve conflicto.
   */
  async commit(change: CommitInput): Promise<CommitResult> {
    const { db } = this;
    try {
      return await db.transaction(
        'rw',
        [db.documents, db.revisions, db.blobs, db.outbox, db.historyIndex, db.deviceSettings],
        async () => {
          const device = await this.getDeviceState();
          const existing = await db.documents.get(change.documentId);
          const nowIso = this.now().toISOString();

          const revision: Revision = revisionSchema.parse({
            schemaVersion: REVISION_SCHEMA_VERSION,
            id: newId(),
            documentId: change.documentId,
            parentIds: change.knownHeads,
            deviceId: device.deviceId,
            createdAt: nowIso,
            operation: change.operation,
            metadata: change.metadata,
            contentRefs: change.contentRefs,
          });

          const { body, extensions, assets } = revision.contentRefs;
          const missing = new Set(
            [body, extensions, ...assets].filter((h): h is string => h !== null),
          );
          for (const blob of change.blobs) {
            if (!(await db.blobs.get(blob.hash))) await db.blobs.add(blob);
            missing.delete(blob.hash);
          }
          // Nunca activar una revisión con objetos ausentes (diseño §7.1, paso 6).
          for (const hash of missing) {
            if (!(await db.blobs.get(hash))) {
              throw new DomainError('storage-failure', `Objeto ausente: ${hash}`);
            }
          }

          let status: CommitResult['status'] = 'committed';
          let heads: Uuid[];
          if (!existing || sameHeads(existing.headRevisionIds, change.knownHeads)) {
            heads = [revision.id];
          } else {
            const known = new Set(change.knownHeads);
            heads = [...existing.headRevisionIds.filter((id) => !known.has(id)), revision.id];
            status = 'conflict';
          }

          const document: DocumentRecord = {
            id: change.documentId,
            kind: change.kind,
            title: revision.metadata.title,
            folderId: revision.metadata.folderId,
            tags: revision.metadata.tags,
            deleted: revision.metadata.deleted,
            ...documentExtras(revision.metadata),
            headRevisionIds: heads,
            generation: (existing?.generation ?? 0) + 1,
            createdAt: existing?.createdAt ?? nowIso,
            updatedAt: nowIso,
          };

          await db.revisions.add(revision);
          await db.documents.put(document);
          await db.historyIndex.add({
            revisionId: revision.id,
            documentId: revision.documentId,
            createdAt: revision.createdAt,
            operation: revision.operation,
            title: revision.metadata.title,
          });
          await db.outbox.add({
            id: newId(),
            type: 'revision',
            revisionId: revision.id,
            documentId: revision.documentId,
            createdAt: nowIso,
          });
          await db.deviceSettings.put({
            key: DEVICE_KEY,
            value: { ...device, localGeneration: device.localGeneration + 1 },
          });

          return { status, revision, document };
        },
      );
    } catch (error) {
      return mapStorageError(error);
    }
  }

  /** Restaurar crea una revisión nueva con contenido antiguo y padre en la cabeza actual (§7.2). */
  async restore(documentId: Uuid, revisionId: Uuid): Promise<Revision> {
    const [doc, old] = await Promise.all([
      this.getDocument(documentId),
      this.getRevision(revisionId),
    ]);
    if (!doc || old?.documentId !== documentId) {
      throw new DomainError('not-found', 'Revisión no encontrada');
    }
    const result = await this.commit({
      documentId,
      kind: doc.kind,
      operation: 'restore',
      knownHeads: doc.headRevisionIds,
      metadata: { ...old.metadata, deleted: false },
      contentRefs: old.contentRefs,
      blobs: [],
    });
    return result.revision;
  }

  /**
   * Resolver un conflicto conservando una de las cabezas (diseño §8.1): nueva revisión
   * `resolve` cuyos padres son todas las cabezas divergentes. Ninguna rama se borra del
   * historial. Una combinación manual se guarda con `commit` y `operation: 'resolve'`.
   */
  async resolve(documentId: Uuid, parents: Uuid[], choice: ResolveInput): Promise<Revision> {
    const [doc, kept] = await Promise.all([
      this.getDocument(documentId),
      this.getRevision(choice.keepRevisionId),
    ]);
    if (!doc || kept?.documentId !== documentId || !parents.includes(kept.id)) {
      throw new DomainError('not-found', 'Revisión a conservar no encontrada');
    }
    const result = await this.commit({
      documentId,
      kind: doc.kind,
      operation: 'resolve',
      knownHeads: parents,
      metadata: kept.metadata,
      contentRefs: kept.contentRefs,
      blobs: [],
    });
    return result.revision;
  }

  async listHistory(documentId: Uuid): Promise<HistoryEntry[]> {
    const rows = await this.db.historyIndex.where({ documentId }).sortBy('createdAt');
    return rows.reverse();
  }

  /** Generación coherente del almacén completo (diseño §12.2, paso 1). */
  async exportContent(): Promise<VaultContent> {
    const { db } = this;
    return db.transaction(
      'r',
      [db.deviceSettings, db.documents, db.revisions, db.blobs, db.controls],
      async () => {
        const blobs = new Map<string, StoredBlob>();
        await db.blobs.each((b) => {
          blobs.set(b.hash, b);
        });
        return {
          vault: await this.getVault(),
          documents: await db.documents.toArray(),
          revisions: await db.revisions.toArray(),
          blobs,
          controls: await db.controls.toArray(),
        };
      },
    );
  }

  /**
   * Carga un contenido completo en una base vacía (restauración en un almacén nuevo, §12.2,
   * paso 4). Crea un dispositivo nuevo: la identidad del dispositivo no viaja en las copias.
   */
  async importContent(content: VaultContent): Promise<void> {
    const { db } = this;
    try {
      await db.transaction(
        'rw',
        [db.deviceSettings, db.documents, db.revisions, db.blobs, db.controls, db.historyIndex],
        async () => {
          if ((await db.deviceSettings.get(VAULT_KEY)) || (await db.documents.count()) > 0) {
            throw new DomainError('storage-failure', 'La base de destino no está vacía');
          }
          await db.deviceSettings.put({ key: VAULT_KEY, value: content.vault });
          await db.deviceSettings.put({
            key: DEVICE_KEY,
            value: { deviceId: newId(), localGeneration: 0, syncCursor: null, remoteFileMap: {} },
          });
          await db.blobs.bulkPut([...content.blobs.values()]);
          await db.revisions.bulkPut(content.revisions);
          await db.documents.bulkPut(content.documents);
          await db.controls.bulkPut(content.controls);
          await db.historyIndex.bulkPut(
            content.revisions.map((r) => ({
              revisionId: r.id,
              documentId: r.documentId,
              createdAt: r.createdAt,
              operation: r.operation,
              title: r.metadata.title,
            })),
          );
        },
      );
    } catch (error) {
      mapStorageError(error);
    }
  }

  async purgeDocument(documentId: Uuid): Promise<PurgeResult> {
    const { db } = this;
    try {
      return await db.transaction(
        'rw',
        [
          db.documents,
          db.revisions,
          db.blobs,
          db.historyIndex,
          db.controls,
          db.outbox,
          db.deviceSettings,
        ],
        async () => {
          const doc = await db.documents.get(documentId);
          if (!doc) throw new DomainError('not-found', 'Documento no encontrado');
          if (!doc.deleted) {
            throw new DomainError(
              'storage-failure',
              'Solo se elimina definitivamente desde la papelera',
            );
          }
          const revisions = await db.revisions.where({ documentId }).toArray();
          const candidates = new Set(
            revisions.flatMap((r) =>
              [r.contentRefs.body, r.contentRefs.extensions, ...r.contentRefs.assets].filter(
                (h): h is string => h !== null,
              ),
            ),
          );
          // No borrar blobs que otra revisión retenida sigue usando (diseño §7.2).
          await db.revisions
            .where('documentId')
            .notEqual(documentId)
            .each((r) => {
              for (const h of [
                r.contentRefs.body,
                r.contentRefs.extensions,
                ...r.contentRefs.assets,
              ]) {
                if (h) candidates.delete(h);
              }
            });
          let freedBytes = 0;
          for (const hash of candidates) {
            const blob = await db.blobs.get(hash);
            if (blob) freedBytes += blob.byteLength;
          }
          await db.blobs.bulkDelete([...candidates]);
          const ids = revisions.map((r) => r.id);
          await db.revisions.bulkDelete(ids);
          await db.historyIndex.where({ documentId }).delete();
          await db.documents.delete(documentId);
          const device = await this.getDeviceState();
          // Orden explícita para que otro equipo no resucite estas versiones al sincronizar.
          await db.controls.add({
            schemaVersion: 1,
            id: newId(),
            revisionIds: ids,
            deviceId: device.deviceId,
            createdAt: this.now().toISOString(),
          });
          return { revisions: ids.length, freedBytes };
        },
      );
    } catch (error) {
      return mapStorageError(error);
    }
  }

  async versionSpace(documentId: Uuid): Promise<VersionSpace> {
    const { db } = this;
    return db.transaction('r', [db.revisions, db.blobs], async () => {
      const own = await db.revisions.where({ documentId }).toArray();
      const refs = (r: Revision) =>
        [r.contentRefs.body, r.contentRefs.extensions, ...r.contentRefs.assets].filter(
          (h): h is string => h !== null,
        );
      // Cuántas versiones de este documento usan cada objeto, y cuáles usan otros documentos.
      const uses = new Map<string, number>();
      for (const r of own) for (const h of new Set(refs(r))) uses.set(h, (uses.get(h) ?? 0) + 1);
      const elsewhere = new Set<string>();
      await db.revisions
        .where('documentId')
        .notEqual(documentId)
        .each((r) => {
          for (const h of refs(r)) if (uses.has(h)) elsewhere.add(h);
        });
      const sizes = new Map<string, number>();
      for (const blob of await db.blobs.bulkGet([...uses.keys()])) {
        if (blob) sizes.set(blob.hash, blob.byteLength);
      }
      const freeableBytes: Record<Uuid, number> = {};
      for (const r of own) {
        freeableBytes[r.id] = [...new Set(refs(r))]
          .filter((h) => uses.get(h) === 1 && !elsewhere.has(h))
          .reduce((sum, h) => sum + (sizes.get(h) ?? 0), 0);
      }
      const totalBytes = [...sizes.values()].reduce((a, b) => a + b, 0);
      return { totalBytes, freeableBytes };
    });
  }

  async pruneRevisions(documentId: Uuid, revisionIds: Uuid[]): Promise<PurgeResult> {
    const { db } = this;
    try {
      return await db.transaction(
        'rw',
        [
          db.documents,
          db.revisions,
          db.blobs,
          db.historyIndex,
          db.controls,
          db.outbox,
          db.deviceSettings,
        ],
        async () => {
          const doc = await db.documents.get(documentId);
          if (!doc) throw new DomainError('not-found', 'Documento no encontrado');
          const heads = new Set(doc.headRevisionIds);
          // Nunca una cabeza: la versión vigente (o las de un conflicto) no se poda.
          const targets = (await db.revisions.bulkGet(revisionIds)).filter(
            (r): r is Revision =>
              r !== undefined && r.documentId === documentId && !heads.has(r.id),
          );
          if (!targets.length) return { revisions: 0, freedBytes: 0 };
          const ids = targets.map((r) => r.id);
          await db.revisions.bulkDelete(ids);
          await db.historyIndex.bulkDelete(ids);
          const pruned = new Set(ids);
          await db.outbox.filter((o) => pruned.has(o.revisionId)).delete();
          // Objetos que ya no usa ninguna versión retenida del almacén.
          const candidates = new Set(
            targets.flatMap((r) =>
              [r.contentRefs.body, r.contentRefs.extensions, ...r.contentRefs.assets].filter(
                (h): h is string => h !== null,
              ),
            ),
          );
          await db.revisions.each((r) => {
            for (const h of [
              r.contentRefs.body,
              r.contentRefs.extensions,
              ...r.contentRefs.assets,
            ]) {
              if (h) candidates.delete(h);
            }
          });
          let freedBytes = 0;
          for (const blob of await db.blobs.bulkGet([...candidates])) {
            if (blob) freedBytes += blob.byteLength;
          }
          await db.blobs.bulkDelete([...candidates]);
          const device = await this.getDeviceState();
          await db.controls.add({
            schemaVersion: 1,
            id: newId(),
            revisionIds: ids,
            deviceId: device.deviceId,
            createdAt: this.now().toISOString(),
          });
          return { revisions: ids.length, freedBytes };
        },
      );
    } catch (error) {
      return mapStorageError(error);
    }
  }

  /** Instantánea en memoria. Pendiente: empaquetarla como ZIP con manifiesto (diseño §12.2). */
  async exportSnapshot(): Promise<VaultSnapshot> {
    const { db } = this;
    return db.transaction(
      'r',
      [db.deviceSettings, db.documents, db.revisions, db.blobs, db.controls],
      async () => ({
        vault: await this.getVault(),
        documents: await db.documents.toArray(),
        revisions: await db.revisions.toArray(),
        blobHashes: (await db.blobs.toCollection().primaryKeys()) as string[],
        controls: await db.controls.toArray(),
      }),
    );
  }
}
