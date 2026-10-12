import { beforeEach, describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { DomainError } from '../../src/domain/errors.ts';
import { parseNoteMarkdown } from '../../src/domain/frontmatter.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../../src/shared/hash.ts';

let dbName: string;

async function openVault() {
  const db = new VaultDatabase(dbName);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  return { db, repo, service: new VaultService(repo) };
}

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
});

describe('almacén local', () => {
  it('conserva almacén y dispositivo entre aperturas', async () => {
    const a = await openVault();
    const vaultA = await a.repo.getVault();
    a.db.close();
    const b = await openVault();
    expect(await b.repo.getVault()).toEqual(vaultA);
  });

  it('crea, guarda y reabre una nota (nueva conexión a IndexedDB)', async () => {
    const a = await openVault();
    const doc = await a.service.createDocument('note', 'Ideas de arquitectura');
    const note = await a.service.openNote(doc.id);
    expect(note.body).toBe('# Ideas de arquitectura\n');

    const result = await a.service.saveNote(note.session, '# Ideas\n\nTexto **nuevo** ✓\n');
    expect(result.status).toBe('committed');
    a.db.close();

    const b = await openVault();
    const reopened = await b.service.openNote(doc.id);
    expect(reopened.body).toBe('# Ideas\n\nTexto **nuevo** ✓\n');
    expect(reopened.document.headRevisionIds).toEqual([result.revision.id]);

    // El blob guardado es Markdown con frontmatter y su hash es el de los bytes exactos.
    const blob = await b.repo.getBlob(result.revision.contentRefs.body!);
    expect(await sha256Hex(blob!.bytes)).toBe(blob!.hash);
    const parsed = parseNoteMarkdown(utf8Decode(blob!.bytes));
    expect(parsed.frontmatter).toMatchObject({ id: doc.id, title: 'Ideas de arquitectura' });
  });

  it('registra revisión, historial y outbox en la misma operación', async () => {
    const { db, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const note = await service.openNote(doc.id);
    await service.saveNote(note.session, 'uno');
    await service.saveNote(note.session, 'dos');
    expect(await db.revisions.where({ documentId: doc.id }).count()).toBe(3);
    expect(await db.historyIndex.where({ documentId: doc.id }).count()).toBe(3);
    expect(await db.outbox.count()).toBe(3);
    const revs = await db.revisions.where({ documentId: doc.id }).sortBy('createdAt');
    // Cada revisión apunta a la anterior.
    const heads = (await db.documents.get(doc.id))!.headRevisionIds;
    expect(heads).toHaveLength(1);
    const last = revs.find((r) => r.id === heads[0])!;
    expect(last.parentIds).toHaveLength(1);
  });

  it('no crea revisión si el contenido no cambió', async () => {
    const { db, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const note = await service.openNote(doc.id);
    await service.saveNote(note.session, note.body);
    expect(await db.revisions.count()).toBe(1);
  });

  it('renombrar conserva el UUID, actualiza el frontmatter y el cuerpo', async () => {
    const { repo, service } = await openVault();
    const doc = await service.createDocument('note', 'Antes');
    const note = await service.openNote(doc.id);
    await service.saveNote(note.session, 'Cuerpo intacto\n');
    const renamed = await service.renameDocument(doc.id, '  Después  ');
    expect(renamed.document.id).toBe(doc.id);
    expect(renamed.document.title).toBe('Después');

    const reopened = await service.openNote(doc.id);
    expect(reopened.body).toBe('Cuerpo intacto\n');
    const blob = await repo.getBlob(renamed.revision.contentRefs.body!);
    expect(parseNoteMarkdown(utf8Decode(blob!.bytes)).frontmatter?.title).toBe('Después');

    // El editor abierto comparte la sesión: su siguiente guardado no genera conflicto.
    const after = await service.saveNote(note.session, 'Cuerpo editado\n');
    expect(after.status).toBe('committed');
    expect(after.revision.metadata.title).toBe('Después');
  });

  it('rechaza títulos vacíos', async () => {
    const { service } = await openVault();
    await expect(service.createDocument('note', '   ')).rejects.toBeInstanceOf(DomainError);
  });

  it('renombra lienzos sin tocar la escena', async () => {
    const { service } = await openVault();
    const doc = await service.createDocument('canvas', 'Mapa');
    const before = await service.openCanvas(doc.id);
    const renamed = await service.renameDocument(doc.id, 'Mapa principal');
    const after = await service.openCanvas(doc.id);
    expect(renamed.document.title).toBe('Mapa principal');
    expect(after.sceneJson).toBe(before.sceneJson);
    expect(after.extensions.documentId).toBe(doc.id);
  });

  it('guarda y reabre un lienzo con su asset direccionado por hash', async () => {
    const a = await openVault();
    const doc = await a.service.createDocument('canvas', 'Lienzo');
    const opened = await a.service.openCanvas(doc.id);
    const imageBytes = utf8Encode('bytes-de-imagen');
    const hash = await sha256Hex(imageBytes);
    const sceneJson = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [{ id: 'rect-1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50 }],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {
        f1: { id: 'f1', mimeType: 'image/png', dataURL: `mindnote-asset:${hash}`, created: 1 },
      },
    });
    const result = await a.service.saveCanvas(opened.session, {
      sceneJson,
      assets: [{ hash, mimeType: 'image/png', bytes: imageBytes }],
    });
    expect(result.revision.contentRefs.assets).toEqual([hash]);
    a.db.close();

    const b = await openVault();
    const reopened = await b.service.openCanvas(doc.id);
    expect(reopened.sceneJson).toBe(sceneJson);
    const asset = await b.service.loadAsset(hash);
    expect(utf8Decode(asset!.bytes)).toBe('bytes-de-imagen');
  });

  it('conserva un cambio concurrente como rama en vez de sobrescribir', async () => {
    const { db, repo, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const [base] = (await repo.getDocument(doc.id))!.headRevisionIds;

    // Otra pestaña avanza la cabeza.
    const other = new VaultService(new DexieVaultRepository(new VaultDatabase(dbName)));
    const otherNote = await other.openNote(doc.id);
    await other.saveNote(otherNote.session, 'desde otra pestaña');

    // Esta sesión aún cree que la cabeza es la base.
    const stale = { documentId: doc.id, knownHeads: [base!], readOnly: null };
    const result = await service.saveNote(stale, 'desde esta pestaña');
    expect(result.status).toBe('conflict');
    expect(result.document.headRevisionIds).toHaveLength(2);
    expect(result.revision.parentIds).toEqual([base]);
    expect(await db.revisions.count()).toBe(3);
  });

  it('no activa una revisión con objetos ausentes y no deja escrituras parciales', async () => {
    const { db, repo, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const before = {
      revisions: await db.revisions.count(),
      outbox: await db.outbox.count(),
      doc: await db.documents.get(doc.id),
    };
    await expect(
      repo.commit({
        documentId: doc.id,
        kind: 'note',
        operation: 'save',
        knownHeads: before.doc!.headRevisionIds,
        metadata: { kind: 'note', title: 'N', folderId: null, tags: [], deleted: false },
        contentRefs: { body: 'a'.repeat(64), extensions: null, assets: [] },
        blobs: [],
      }),
    ).rejects.toMatchObject({ code: 'storage-failure' });
    expect(await db.revisions.count()).toBe(before.revisions);
    expect(await db.outbox.count()).toBe(before.outbox);
    expect(await db.documents.get(doc.id)).toEqual(before.doc);
  });

  it('restaurar crea una revisión nueva sin borrar la reemplazada', async () => {
    const { db, repo, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const note = await service.openNote(doc.id);
    const first = await service.saveNote(note.session, 'versión 1');
    await service.saveNote(note.session, 'versión 2');
    const restored = await repo.restore(doc.id, first.revision.id);
    expect(restored.operation).toBe('restore');
    expect(restored.contentRefs.body).toBe(first.revision.contentRefs.body);
    expect(await db.revisions.count()).toBe(4);
  });

  it('resolve está marcado como pendiente', async () => {
    const { repo } = await openVault();
    await expect(
      repo.resolve(crypto.randomUUID(), [], { keepRevisionId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'not-implemented' });
  });
});
