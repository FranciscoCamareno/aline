import { DomainError } from '../../domain/errors.ts';
import type { Uuid } from '../../domain/ids.ts';
import { documentExtras, type DocumentRecord, type Revision } from '../../domain/revision.ts';
import type { VersionPrune } from '../../domain/vault.ts';
import type { Observation, SyncLocalStore, SyncState } from '../../ports/SyncLocalStore.ts';
import type { StoredBlob } from '../../ports/VaultRepository.ts';
import type { VaultDatabase } from './db.ts';

const refsOf = (r: Revision): string[] =>
  [r.contentRefs.body, r.contentRefs.extensions, ...r.contentRefs.assets].filter(
    (h): h is string => typeof h === 'string',
  );

/** Documento derivado de todas sus revisiones: cabezas = no referenciadas como padre (§8.1). */
function deriveDocument(
  revisions: Revision[],
  previous: DocumentRecord | undefined,
): DocumentRecord {
  const referenced = new Set(revisions.flatMap((r) => r.parentIds));
  const sorted = [...revisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const heads = sorted.filter((r) => !referenced.has(r.id));
  const latest = heads.at(-1) ?? sorted.at(-1)!;
  return {
    id: latest.documentId,
    kind: latest.metadata.kind,
    title: latest.metadata.title,
    folderId: latest.metadata.folderId,
    tags: latest.metadata.tags,
    deleted: latest.metadata.deleted,
    ...documentExtras(latest.metadata),
    headRevisionIds: heads.map((r) => r.id),
    generation: (previous?.generation ?? 0) + 1,
    createdAt: previous?.createdAt ?? sorted[0]!.createdAt,
    updatedAt:
      sorted.at(-1)!.createdAt > (previous?.updatedAt ?? '')
        ? sorted.at(-1)!.createdAt
        : previous!.updatedAt,
  };
}

/** Lado local del protocolo de sincronización sobre IndexedDB (diseño §8). */
export class DexieSyncStore implements SyncLocalStore {
  private readonly db: VaultDatabase;

  constructor(db: VaultDatabase) {
    this.db = db;
  }

  async hasRevision(id: Uuid): Promise<boolean> {
    return (await this.db.revisions.where({ id }).count()) > 0;
  }

  async hasBlob(hash: string): Promise<boolean> {
    return (await this.db.blobs.where({ hash }).count()) > 0;
  }

  async applyRemote(revisions: Revision[], blobs: StoredBlob[]): Promise<DocumentRecord[]> {
    const { db } = this;
    return db.transaction(
      'rw',
      [db.documents, db.revisions, db.blobs, db.historyIndex],
      async () => {
        for (const blob of blobs) {
          if (!(await db.blobs.get(blob.hash))) await db.blobs.add(blob);
        }
        const fresh: Revision[] = [];
        for (const rev of revisions) {
          if (await db.revisions.get(rev.id)) continue; // idempotente
          for (const hash of refsOf(rev)) {
            if (!(await db.blobs.get(hash))) {
              throw new DomainError('storage-failure', `Objeto ausente al activar: ${hash}`);
            }
          }
          fresh.push(rev);
        }
        await db.revisions.bulkAdd(fresh);
        await db.historyIndex.bulkPut(
          fresh.map((r) => ({
            revisionId: r.id,
            documentId: r.documentId,
            createdAt: r.createdAt,
            operation: r.operation,
            title: r.metadata.title,
          })),
        );
        const affected = [...new Set(fresh.map((r) => r.documentId))];
        const updated: DocumentRecord[] = [];
        for (const documentId of affected) {
          const all = await db.revisions.where({ documentId }).toArray();
          const doc = deriveDocument(all, await db.documents.get(documentId));
          await db.documents.put(doc);
          updated.push(doc);
        }
        return updated;
      },
    );
  }

  async applyControls(controls: VersionPrune[]): Promise<number> {
    const { db } = this;
    return db.transaction(
      'rw',
      [db.controls, db.documents, db.revisions, db.blobs, db.historyIndex],
      async () => {
        let retired = 0;
        for (const control of controls) {
          if (await db.controls.get(control.id)) continue;
          await db.controls.add(control);
          const targets = new Set(control.revisionIds);
          const byDoc = new Map<string, Revision[]>();
          for (const rev of (await db.revisions.bulkGet(control.revisionIds)).filter(
            (r): r is Revision => r !== undefined,
          )) {
            byDoc.set(rev.documentId, [...(byDoc.get(rev.documentId) ?? []), rev]);
          }
          for (const [documentId] of byDoc) {
            const all = await db.revisions.where({ documentId }).toArray();
            const doc = await db.documents.get(documentId);
            const wholeDocument = all.every((r) => targets.has(r.id));
            // Un borrado definitivo de otro equipo (documento entero en la papelera) se aplica
            // completo; en cualquier otro caso las cabezas vivas se conservan (§7.2).
            const purgeAll = wholeDocument && (doc?.deleted ?? false);
            const keep = new Set(purgeAll ? [] : (doc?.headRevisionIds ?? []));
            const remove = all.filter((r) => targets.has(r.id) && !keep.has(r.id));
            await db.revisions.bulkDelete(remove.map((r) => r.id));
            await db.historyIndex.bulkDelete(remove.map((r) => r.id));
            retired += remove.length;
            if (purgeAll) await db.documents.delete(documentId);
          }
        }
        // Blobs que ya no referencia ninguna revisión retenida.
        if (retired) {
          const used = new Set<string>();
          await db.revisions.each((r) => {
            for (const h of refsOf(r)) used.add(h);
          });
          const orphans = ((await db.blobs.toCollection().primaryKeys()) as string[]).filter(
            (h) => !used.has(h),
          );
          await db.blobs.bulkDelete(orphans);
        }
        return retired;
      },
    );
  }

  listControls(): Promise<VersionPrune[]> {
    return this.db.controls.toArray();
  }

  async unpublishedRevisions(target: string): Promise<Revision[]> {
    const ids = (await this.db.revisions.toCollection().primaryKeys()) as string[];
    const marks = await this.db.remoteFiles.bulkGet(ids.map((id) => key(target, 'rev', id)));
    const missing = ids.filter((_, i) => !marks[i]);
    const revisions = (await this.db.revisions.bulkGet(missing)).filter(
      (r): r is Revision => r !== undefined,
    );
    // Por fecha de creación; el motor de sincronización las pone después con los padres antes
    // que los hijos (la fecha sola no lo garantiza: dos versiones pueden empatar).
    return revisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async isPublished(target: string, kind: 'rev' | 'obj', id: string): Promise<boolean> {
    return (await this.db.remoteFiles.get(key(target, kind, id))) !== undefined;
  }

  async markPublished(target: string, kind: 'rev' | 'obj', ids: string[]): Promise<void> {
    await this.db.remoteFiles.bulkPut(
      ids.map((id) => ({ key: key(target, kind, id), remoteId: id })),
    );
  }

  async clearOutbox(revisionIds: Uuid[]): Promise<void> {
    if (!revisionIds.length) return;
    const ids = new Set(revisionIds);
    await this.db.outbox.filter((e) => ids.has(e.revisionId)).delete();
  }

  async getSyncState(target: string): Promise<SyncState> {
    const value = (await this.db.deviceSettings.get(`sync:${target}`))?.value as
      SyncState | undefined;
    return value ?? { cursor: null, lastPullAt: null, lastPushAt: null };
  }

  async setSyncState(target: string, state: SyncState): Promise<void> {
    await this.db.deviceSettings.put({ key: `sync:${target}`, value: state });
  }

  async getObservation(target: string, path: string): Promise<Observation | undefined> {
    const entry = await this.db.externalObservations.get(`${target}|${path}`);
    return (
      entry && {
        hash: entry.hash,
        lastModified: entry.lastModified,
        ...(entry.revisionId ? { revisionId: entry.revisionId } : {}),
      }
    );
  }

  async setObservation(target: string, path: string, observation: Observation): Promise<void> {
    await this.db.externalObservations.put({
      path: `${target}|${path}`,
      ...observation,
      observedAt: new Date().toISOString(),
    });
  }
}

function key(target: string, kind: 'rev' | 'obj', id: string): string {
  return `${target}|${kind}|${id}`;
}
