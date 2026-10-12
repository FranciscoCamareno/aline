import { zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import {
  ArchiveLimitError,
  isSafeArchivePath,
  unzipFiles,
  zipFiles,
} from '../../src/adapters/zip/fflateArchiver.ts';
import {
  BackupError,
  createBackup,
  emergencyToContent,
  MANIFEST_PATH,
  readBackup,
} from '../../src/application/backup.ts';
import { filesToVault, vaultToFiles } from '../../src/application/vaultFormat.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import type { Archiver } from '../../src/ports/Archiver.ts';
import { utf8Decode, utf8Encode } from '../../src/shared/hash.ts';

/** Archiver síncrono para Node: las mismas funciones que usa el worker. */
const archiver: Archiver = {
  zip: async (files) => zipFiles(files),
  unzip: async (bytes, limits) => unzipFiles(bytes, limits),
};

async function openVault(name = `fase2-${crypto.randomUUID()}`) {
  const db = new VaultDatabase(name);
  const repo = new DexieVaultRepository(db);
  await repo.init('Almacén de prueba');
  return { db, repo, service: new VaultService(repo), name };
}

/** Almacén con una nota con historia, un lienzo con imagen y un documento en la papelera. */
async function populated() {
  const v = await openVault();
  const note = await v.service.createDocument('note', 'Ideas');
  const s = (await v.service.openNote(note.id)).session;
  await v.service.saveNote(s, 'primera versión ñ');
  await v.service.saveNote(s, 'segunda versión ✓');
  const canvas = await v.service.createDocument('canvas', 'Mapa');
  const c = await v.service.openCanvas(canvas.id);
  const image = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', image)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  await v.service.saveCanvas(c.session, {
    sceneJson: JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [],
      files: {
        f: { id: 'f', mimeType: 'image/png', dataURL: `mindnote-asset:${hash}`, created: 1 },
      },
    }),
    assets: [{ hash, mimeType: 'image/png', bytes: image }],
  });
  const trashed = await v.service.createDocument('note', 'Borrador');
  await v.service.trashDocument(trashed.id);
  return { ...v, note, canvas, trashed, imageHash: hash };
}

/** Archivos de contenido (sin índices derivados), para comparar byte a byte (CA-16). */
function contentFiles(files: Map<string, Uint8Array>) {
  return new Map(
    [...files].filter(([p]) =>
      /^(vault\.json|revisions\/|objects\/|assets\/|readable\/|controls\/)/.test(p),
    ),
  );
}

let deviceId: string;
beforeEach(() => {
  deviceId = crypto.randomUUID();
});

describe('formato abierto: serializar y leer (plan 2.1)', () => {
  it('ida y vuelta conserva revisiones, blobs, cabezas y copias legibles', async () => {
    const { service, note, canvas, imageHash } = await populated();
    const content = await service.exportContent();
    const files = vaultToFiles(content, { deviceId });

    expect(files.has('vault.json')).toBe(true);
    expect(files.has(`assets/${imageHash}.png`)).toBe(true);
    const noteRevs = content.revisions.filter((r) => r.documentId === note.id);
    for (const r of noteRevs) expect(files.has(`readable/${note.id}/${r.id}.md`)).toBe(true);
    const noteHead = content.documents.find((d) => d.id === note.id)!.headRevisionIds[0]!;
    expect(utf8Decode(files.get(`readable/${note.id}/${noteHead}.md`)!)).toContain(
      'segunda versión ✓',
    );

    const { content: back, problems } = await filesToVault(files);
    expect(problems).toEqual([]);
    expect(back.vault).toEqual(content.vault);
    expect(new Set(back.revisions.map((r) => r.id))).toEqual(
      new Set(content.revisions.map((r) => r.id)),
    );
    expect(new Set(back.blobs.keys())).toEqual(new Set(content.blobs.keys()));
    for (const doc of content.documents) {
      const other = back.documents.find((d) => d.id === doc.id)!;
      expect(other.headRevisionIds).toEqual(doc.headRevisionIds);
      expect(other.deleted).toBe(doc.deleted);
      expect(other.title).toBe(doc.title);
    }
    expect(back.documents.find((d) => d.id === canvas.id)?.kind).toBe('canvas');
  });

  it('no activa revisiones con objetos alterados o ausentes y vuelve a la cabeza anterior', async () => {
    const { service, note } = await populated();
    const content = await service.exportContent();
    const files = vaultToFiles(content, { deviceId });
    const head = content.documents.find((d) => d.id === note.id)!.headRevisionIds[0]!;
    const headRev = content.revisions.find((r) => r.id === head)!;
    files.set(`objects/${headRev.contentRefs.body}.md`, utf8Encode('alterado'));
    files.set('otro/archivo.txt', utf8Encode('x'));

    const { content: back, problems } = await filesToVault(files);
    expect(problems.map((p) => p.code).sort()).toEqual([
      'hash-mismatch',
      'missing-object',
      'unknown-path',
    ]);
    expect(back.revisions.some((r) => r.id === head)).toBe(false);
    expect(back.documents.find((d) => d.id === note.id)!.headRevisionIds).toEqual(
      headRev.parentIds,
    );
  });

  it('conserva revisiones de versión posterior y descarta las retiradas por un control', async () => {
    const { service, note } = await populated();
    const content = await service.exportContent();
    const files = vaultToFiles(content, { deviceId });
    const revs = content.revisions.filter((r) => r.documentId === note.id);
    const [first, , last] = revs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    files.set(
      `revisions/${last!.id}.json`,
      utf8Encode(JSON.stringify({ ...last, schemaVersion: 2 })),
    );
    const controlId = crypto.randomUUID();
    files.set(
      `controls/${controlId}.json`,
      utf8Encode(
        JSON.stringify({
          schemaVersion: 1,
          id: controlId,
          revisionIds: [first!.id],
          deviceId,
          createdAt: new Date().toISOString(),
        }),
      ),
    );
    const { content: back, problems } = await filesToVault(files);
    expect(problems.map((p) => p.code).sort()).toEqual(['pruned', 'unsupported-version']);
    expect(back.revisions.find((r) => r.id === last!.id)?.schemaVersion).toBe(2);
    expect(back.revisions.some((r) => r.id === first!.id)).toBe(false);
  });
});

describe('copia completa ZIP y restauración (plan 2.3, CA-16)', () => {
  it('restaura en un almacén nuevo con el contenido idéntico byte a byte', async () => {
    const original = await populated();
    const content = await original.service.exportContent();
    const backup = await createBackup(content, { deviceId, appVersion: '0.1.0', archiver });
    expect(backup.fileCount).toBeGreaterThan(5);

    const { read, verification } = await readBackup(backup.zip, archiver);
    expect(verification).toEqual({ missing: [], mismatched: [], undeclared: [], rejected: [] });
    expect(read.problems).toEqual([]);

    const target = new DexieVaultRepository(new VaultDatabase(`restaurado-${crypto.randomUUID()}`));
    await target.importContent(read.content);
    const restored = await target.exportContent();

    const a = contentFiles(vaultToFiles(content, { deviceId }));
    const b = contentFiles(vaultToFiles(restored, { deviceId }));
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
    const differing = [...a].filter(
      ([path, bytes]) => !Buffer.from(b.get(path)!).equals(Buffer.from(bytes)),
    );
    expect(differing.map(([p]) => p)).toEqual([]);

    // El almacén restaurado funciona: se abre, conserva la papelera y la identidad del almacén.
    const service = new VaultService(target);
    expect((await service.openNote(original.note.id)).body).toBe('segunda versión ✓');
    expect((await target.getDocument(original.trashed.id))?.deleted).toBe(true);
    expect((await target.getVault()).id).toBe((await original.repo.getVault()).id);
    expect((await target.getDeviceState()).deviceId).not.toBe(
      (await original.repo.getDeviceState()).deviceId,
    );
  });

  it('rechaza una copia alterada sin restaurar nada a medias', async () => {
    const { service } = await populated();
    const backup = await createBackup(await service.exportContent(), {
      deviceId,
      appVersion: 'x',
      archiver,
    });
    const files = unzipFiles(backup.zip, {
      maxEntries: 1e5,
      maxTotalBytes: 1e9,
      maxFileBytes: 1e9,
    }).files;
    const rev = [...files.keys()].find((p) => p.startsWith('revisions/'))!;
    files.set(rev, utf8Encode('{"alterado":true}'));
    await expect(readBackup(zipFiles(files), archiver)).rejects.toMatchObject({ code: 'corrupt' });

    files.delete(MANIFEST_PATH);
    await expect(readBackup(zipFiles(files), archiver)).rejects.toBeInstanceOf(BackupError);
  });

  it('no extrae rutas que salen del directorio y respeta los límites de descompresión', () => {
    expect(isSafeArchivePath('revisions/a.json')).toBe(true);
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b', 'a//b']) {
      expect(isSafeArchivePath(bad)).toBe(false);
    }
    const zip = zipSync({ '../evil.txt': utf8Encode('x'), 'vault.json': utf8Encode('{}') });
    const { files, rejected } = unzipFiles(zip, {
      maxEntries: 10,
      maxTotalBytes: 1e6,
      maxFileBytes: 1e6,
    });
    expect([...files.keys()]).toEqual(['vault.json']);
    expect(rejected).toEqual([{ path: '../evil.txt', reason: 'unsafe-path' }]);

    const bomb = zipSync({ 'objects/a.json': new Uint8Array(5_000_000) });
    expect(() =>
      unzipFiles(bomb, { maxEntries: 10, maxTotalBytes: 1_000_000, maxFileBytes: 1e9 }),
    ).toThrow(ArchiveLimitError);
  });

  it('una exportación de emergencia también se puede restaurar', async () => {
    const { service, note } = await populated();
    const content = await emergencyToContent(await service.exportEmergency());
    const target = new DexieVaultRepository(new VaultDatabase(`emergencia-${crypto.randomUUID()}`));
    await target.importContent(content);
    expect((await new VaultService(target).openNote(note.id)).body).toBe('segunda versión ✓');
  });

  it('no importa sobre un almacén que ya tiene contenido', async () => {
    const { repo, service } = await populated();
    await expect(repo.importContent(await service.exportContent())).rejects.toMatchObject({
      code: 'storage-failure',
    });
  });
});

describe('papelera e historial (plan 2.4 y 2.5)', () => {
  it('la papelera conserva contenido; restaurar lo devuelve; el borrado definitivo es explícito', async () => {
    const { db, service, note, trashed } = await populated();
    expect((await service.listDocuments()).find((d) => d.id === trashed.id)?.deleted).toBe(true);
    await expect(service.purgeDocument(note.id)).rejects.toMatchObject({ code: 'storage-failure' });

    await service.restoreFromTrash(trashed.id);
    expect((await db.documents.get(trashed.id))?.deleted).toBe(false);
    await service.trashDocument(trashed.id);

    const blobsBefore = await db.blobs.count();
    const result = await service.purgeDocument(trashed.id);
    expect(result.revisions).toBe(4);
    expect(await db.documents.get(trashed.id)).toBeUndefined();
    expect(await db.revisions.where({ documentId: trashed.id }).count()).toBe(0);
    expect(await db.blobs.count()).toBeLessThan(blobsBefore);
    const control = (await db.controls.toArray()).at(-1)!;
    expect(control.revisionIds).toHaveLength(4);
    // Los blobs de otros documentos siguen ahí.
    expect((await service.openNote(note.id)).body).toBe('segunda versión ✓');
  });

  it('el historial lista versiones sin cuerpos y restaurar crea una revisión nueva', async () => {
    const { service, note } = await populated();
    const history = await service.listHistory(note.id);
    expect(history.map((h) => h.operation)).toEqual(['save', 'save', 'save']);
    const oldest = history.at(-1)!;
    const preview = await service.previewRevision(history[1]!.revisionId);
    expect(preview.kind === 'note' && preview.body).toBe('primera versión ñ');

    await service.restoreRevision(note.id, history[1]!.revisionId);
    expect((await service.openNote(note.id)).body).toBe('primera versión ñ');
    const after = await service.listHistory(note.id);
    expect(after).toHaveLength(4);
    expect(after[0]!.operation).toBe('restore');
    expect(after.some((h) => h.revisionId === oldest.revisionId)).toBe(true);
  });
});

describe('conflictos (plan 2.6, CA-14)', () => {
  async function conflicted() {
    const v = await openVault();
    const doc = await v.service.createDocument('note', 'Compartida');
    const [base] = doc.headRevisionIds;
    const otherTab = new VaultService(new DexieVaultRepository(new VaultDatabase(v.name)));
    const s = (await otherTab.openNote(doc.id)).session;
    await otherTab.saveNote(s, 'versión del PC');
    await v.service.saveNote(
      { documentId: doc.id, knownHeads: [base!], readOnly: null },
      'versión del iPad',
    );
    const heads = await v.service.conflictHeads(doc.id);
    expect(heads).toHaveLength(2);
    return { ...v, doc, heads };
  }

  it('conservar una cabeza deja una sola y las dos siguen en el historial', async () => {
    const { service, doc, heads } = await conflicted();
    const { result } = await service.resolveConflict(doc.id, {
      kind: 'keep',
      revisionId: heads[0]!.id,
    });
    expect(result.status).toBe('committed');
    expect(result.document.headRevisionIds).toEqual([result.revision.id]);
    expect(result.revision.operation).toBe('resolve');
    expect(new Set(result.revision.parentIds)).toEqual(new Set(heads.map((h) => h.id)));
    expect((await service.openNote(doc.id)).body).toBe('versión del PC');
  });

  it('combinar a mano guarda el texto combinado', async () => {
    const { service, doc } = await conflicted();
    await service.resolveConflict(doc.id, { kind: 'merge', body: 'PC + iPad' });
    expect((await service.openNote(doc.id)).body).toBe('PC + iPad');
  });

  it('duplicar conserva ambas: una aquí y otra en un documento nuevo', async () => {
    const { service, doc, heads } = await conflicted();
    const { duplicate } = await service.resolveConflict(doc.id, {
      kind: 'duplicate',
      keepRevisionId: heads[0]!.id,
      copyRevisionId: heads[1]!.id,
      copyTitle: 'Compartida (copia)',
    });
    expect(duplicate?.id).not.toBe(doc.id);
    expect((await service.openNote(doc.id)).body).toBe('versión del PC');
    const copy = await service.openNote(duplicate!.id);
    expect(copy.body).toBe('versión del iPad');
    expect(copy.document.title).toBe('Compartida (copia)');
  });
});
