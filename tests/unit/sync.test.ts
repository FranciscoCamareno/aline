import { describe, expect, it } from 'vitest';
import { FolderRemoteStore } from '../../src/adapters/filesystem/FolderRemoteStore.ts';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieSyncStore } from '../../src/adapters/indexeddb/DexieSyncStore.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { SyncEngine, VaultMismatchError } from '../../src/application/SyncEngine.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { RemoteError, type RemoteStore } from '../../src/ports/RemoteStore.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../../src/shared/hash.ts';
import { MemoryDirectory } from './memoryDirectory.ts';

interface Device {
  db: VaultDatabase;
  repo: DexieVaultRepository;
  service: VaultService;
  engine: SyncEngine;
}

/** Un «dispositivo»: su propia base IndexedDB, mismo almacén lógico, motor contra la carpeta. */
async function device(
  folder: MemoryDirectory,
  from?: Device,
  wrap?: (s: RemoteStore) => RemoteStore,
): Promise<Device> {
  const db = new VaultDatabase(`sync-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  if (from) {
    // Mismo almacén (mismo vaultId) en otro equipo: identidad nueva de dispositivo.
    await repo.importContent({
      vault: await from.repo.getVault(),
      documents: [],
      revisions: [],
      blobs: new Map(),
      controls: [],
    });
  } else {
    await repo.init('Almacén compartido');
  }
  const service = new VaultService(repo);
  const remote = wrap ? wrap(new FolderRemoteStore(folder)) : new FolderRemoteStore(folder);
  const engine = new SyncEngine({
    target: 'folder',
    remote,
    local: new DexieSyncStore(db),
    reader: repo,
    importExternal: (doc, parent, bytes) => service.importExternalNote(doc, parent, bytes),
    sleep: async () => undefined,
  });
  return { db, repo, service, engine };
}

async function body(d: Device, id: string) {
  return (await d.service.openNote(id)).body;
}

async function edit(d: Device, id: string, text: string) {
  const note = await d.service.openNote(id);
  return d.service.saveNote(note.session, text);
}

describe('sincronización por carpeta (plan 4.2, 4.6, 4.7)', () => {
  it('tres dispositivos convergen y la carpeta queda en el formato abierto', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    const note = await a.service.createDocument('note', 'Plan');
    await edit(a, note.id, 'escrito en A ñ');
    const canvas = await a.service.createDocument('canvas', 'Mapa');
    const c0 = await a.service.openCanvas(canvas.id);
    const image = new Uint8Array([1, 2, 3, 4]);
    const hash = await sha256Hex(image);
    await a.service.saveCanvas(c0.session, {
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

    const r1 = await a.engine.runCycle();
    expect(r1.pushedRevisions).toBe(4); // nota (crear + guardar) y lienzo (crear + guardar)
    expect(await a.engine.pendingCount()).toBe(0);
    expect(folder.file('vault.json')).toBeDefined();
    expect(folder.list('assets')).toContain(`${hash}.png`);
    expect(folder.list('readable')).toContain(note.id);
    expect(folder.list('heads')).toHaveLength(1);
    expect(folder.file('catalog.json')).toBeDefined();

    const b = await device(folder, a);
    const c = await device(folder, a);
    for (const d of [b, c]) {
      const r = await d.engine.runCycle();
      expect(r.rejected).toEqual([]);
      expect(await body(d, note.id)).toBe('escrito en A ñ');
      expect((await d.service.loadAsset(hash))?.mimeType).toBe('image/png');
    }

    await edit(b, note.id, 'editado en B');
    await b.engine.runCycle();
    await a.engine.runCycle();
    await c.engine.runCycle();
    for (const d of [a, b, c]) {
      expect(await body(d, note.id)).toBe('editado en B');
      expect((await d.repo.getDocument(note.id))?.headRevisionIds).toHaveLength(1);
    }
    expect(folder.list('heads')).toHaveLength(3);
  });

  it('ediciones concurrentes sin red: ambas versiones se conservan y la resolución se propaga (CA-14)', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    const note = await a.service.createDocument('note', 'Compartida');
    await a.engine.runCycle();
    const b = await device(folder, a);
    await b.engine.runCycle();

    await edit(a, note.id, 'versión del PC');
    await edit(b, note.id, 'versión del iPad');
    await a.engine.runCycle();
    const rb = await b.engine.runCycle();
    expect(rb.conflicts).toEqual([note.id]);
    const ra = await a.engine.runCycle();
    expect(ra.conflicts).toEqual([note.id]);

    for (const d of [a, b]) {
      const heads = await d.service.conflictHeads(note.id);
      const texts = await Promise.all(
        heads.map(async (h) => (await d.service.previewRevision(h.id)) as { body: string }),
      );
      expect(texts.map((t) => t.body).sort()).toEqual(['versión del PC', 'versión del iPad']);
    }

    await a.service.resolveConflict(note.id, { kind: 'merge', body: 'PC + iPad' });
    await a.engine.runCycle();
    await b.engine.runCycle();
    expect(await body(b, note.id)).toBe('PC + iPad');
    expect((await b.repo.getDocument(note.id))?.headRevisionIds).toHaveLength(1);
  });

  it('una respuesta perdida no duplica nada al reintentar', async () => {
    const folder = new MemoryDirectory();
    let failNext = true;
    const a = await device(folder, undefined, (store) => ({
      ...bind(store),
      publishRevision: async (rev, op) => {
        const copy = await store.publishRevision(rev, op);
        if (failNext) {
          failNext = false;
          throw new RemoteError('permission', 'drive-forbidden', 'respuesta perdida');
        }
        return copy;
      },
    }));
    await a.service.createDocument('note', 'N');
    await expect(a.engine.runCycle()).rejects.toBeInstanceOf(RemoteError);
    const before = folder.list('revisions');
    await a.engine.runCycle();
    const after = folder.list('revisions');
    expect(after).toEqual(before); // ya estaba escrita: idempotente por id
    expect(await a.engine.pendingCount()).toBe(0);
  });

  it('no activa revisiones con objetos ausentes o alterados; las completa en un ciclo posterior', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    const note = await a.service.createDocument('note', 'N');
    const saved = await edit(a, note.id, 'contenido');
    await a.engine.runCycle();
    const bodyHash = saved.revision.contentRefs.body!;
    const objectFile = folder.file(`objects/${bodyHash}.md`)!;
    const original = objectFile.bytes;

    // Subida parcial de otro equipo: falta el objeto.
    (folder.entries.get('objects') as MemoryDirectory).entries.delete(`${bodyHash}.md`);
    const b = await device(folder, a);
    const r1 = await b.engine.runCycle();
    expect(r1.rejected).toContainEqual({ revisionId: saved.revision.id, reason: 'missing-object' });
    expect(await b.repo.getRevision(saved.revision.id)).toBeUndefined();

    // Objeto alterado.
    await folder.writeFile(`objects/${bodyHash}.md`, utf8Encode('alterado'));
    const r2 = await b.engine.runCycle();
    expect(r2.rejected).toContainEqual({ revisionId: saved.revision.id, reason: 'hash-mismatch' });

    await folder.writeFile(`objects/${bodyHash}.md`, original);
    const r3 = await b.engine.runCycle();
    expect(r3.rejected).toEqual([]);
    expect(await body(b, note.id)).toBe('contenido');
  });

  it('una carpeta de otro almacén no se mezcla (§8.4)', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    await a.engine.runCycle();
    const other = await device(folder);
    await expect(other.engine.runCycle()).rejects.toBeInstanceOf(VaultMismatchError);
    // La carpeta sigue siendo del almacén A: nada del otro almacén se escribió en ella.
    expect(folder.list('revisions')).toEqual([]);
    expect(JSON.parse(utf8Decode(folder.file('vault.json')!.bytes)).id).toBe(
      (await a.repo.getVault()).id,
    );
  });

  it('un borrado definitivo se propaga y no resucita', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    const doc = await a.service.createDocument('note', 'Temporal');
    await a.engine.runCycle();
    const b = await device(folder, a);
    await b.engine.runCycle();
    expect(await b.repo.getDocument(doc.id)).toBeDefined();

    await a.service.trashDocument(doc.id);
    await a.engine.runCycle();
    await b.engine.runCycle();
    await a.service.purgeDocument(doc.id);
    await a.engine.runCycle();
    expect(folder.list('controls')).toHaveLength(1);

    await b.engine.runCycle();
    expect(await b.repo.getDocument(doc.id)).toBeUndefined();
    await b.engine.runCycle();
    await a.engine.runCycle();
    expect(await a.repo.getDocument(doc.id)).toBeUndefined();
    expect(await b.repo.getDocument(doc.id)).toBeUndefined();
  });

  it('importa ediciones hechas fuera de la aplicación y no las reimporta (§8.3, CA-28)', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    const note = await a.service.createDocument('note', 'Editable');
    const saved = await edit(a, note.id, 'original');
    await a.engine.runCycle();
    const path = `readable/${note.id}/${saved.revision.id}.md`;
    const text = utf8Decode(folder.file(path)!.bytes).replace(
      'original',
      'cambiado en el bloc de notas',
    );
    await folder.writeFile(path, utf8Encode(text));

    const r = await a.engine.runCycle();
    expect(r.externalEdits).toBe(1);
    expect(await body(a, note.id)).toBe('cambiado en el bloc de notas');
    const history = await a.service.listHistory(note.id);
    expect(history[0]?.operation).toBe('external');
    expect((await a.engine.runCycle()).externalEdits).toBe(0);

    // Edición externa y edición en la app a la vez: ninguna gana en silencio.
    await folder.writeFile(path, utf8Encode(text.replace('cambiado', 'cambiado otra vez')));
    await edit(a, note.id, 'cambio en la app');
    const r2 = await a.engine.runCycle();
    expect(r2.externalEdits).toBe(1);
    expect((await a.repo.getDocument(note.id))?.headRevisionIds).toHaveLength(2);
  });

  it('reintenta errores transitorios con espera y respeta Retry-After', async () => {
    const folder = new MemoryDirectory();
    const delays: number[] = [];
    let failures = 2;
    const db = new VaultDatabase(`sync-${crypto.randomUUID()}`);
    const repo = new DexieVaultRepository(db);
    await repo.init();
    const store = new FolderRemoteStore(folder);
    const engine = new SyncEngine({
      target: 'folder',
      remote: {
        ...bind(store),
        pull: async (cursor) => {
          if (failures-- > 0)
            throw new RemoteError('transient', 'offline', 'red', failures === 0 ? 3 : null);
          return store.pull(cursor);
        },
      },
      local: new DexieSyncStore(db),
      reader: repo,
      sleep: async (ms) => void delays.push(ms),
    });
    await new VaultService(repo).createDocument('note', 'N');
    await engine.runCycle();
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBe(3000);
  });
});

/** Métodos del almacén enlazados, para envolver solo algunos en las pruebas. */
function bind(store: RemoteStore): RemoteStore {
  return {
    readVault: () => store.readVault(),
    initializeVault: (v) => store.initializeVault(v),
    pull: (c) => store.pull(c),
    getRevision: (id) => store.getRevision(id),
    getObject: (h) => store.getObject(h),
    putObject: (o, op) => store.putObject(o, op),
    publishRevision: (r, op) => store.publishRevision(r, op),
    publishControl: (c) => store.publishControl(c),
    publishIndexes: (d, docs, v) => store.publishIndexes(d, docs, v),
    listReadableCopies: () => store.listReadableCopies(),
  };
}

describe('sincronización en paralelo', () => {
  it('publica documentos distintos a la vez y cada versión después de sus padres', async () => {
    const folder = new MemoryDirectory();
    const published: string[] = [];
    const parentsMissing: string[] = [];
    let running = 0;
    let peak = 0;
    const a = await device(folder, undefined, (store) => ({
      ...bind(store),
      publishRevision: async (rev, op) => {
        running++;
        peak = Math.max(peak, running);
        if (rev.parentIds.some((p) => !published.includes(p))) parentsMissing.push(rev.id);
        await new Promise((r) => setTimeout(r, 5));
        const copy = await store.publishRevision(rev, op);
        published.push(rev.id);
        running--;
        return copy;
      },
    }));
    const docs: string[] = [];
    for (let n = 0; n < 6; n++) {
      const note = await a.service.createDocument('note', `Nota ${n}`);
      docs.push(note.id);
      for (let v = 0; v < 3; v++) await edit(a, note.id, `versión ${v}`);
    }
    const result = await a.engine.runCycle();
    expect(result.pushedRevisions).toBe(24);
    expect(published).toHaveLength(24);
    expect(parentsMissing).toEqual([]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    const b = await device(folder, a);
    await b.engine.runCycle();
    for (const doc of docs) expect(await body(b, doc)).toBe('versión 2');
  });
});

describe('carpeta: lecturas simultáneas', () => {
  it('varios getObject a la vez encuentran todos los objetos (índice compartido)', async () => {
    const folder = new MemoryDirectory();
    const a = await device(folder);
    const hashes: string[] = [];
    for (let n = 0; n < 5; n++) {
      const note = await a.service.createDocument('note', `Nota ${n}`);
      const saved = await edit(a, note.id, `cuerpo ${n}`);
      hashes.push(saved.revision.contentRefs.body!);
    }
    await a.engine.runCycle();
    const fresh = new FolderRemoteStore(folder);
    const found = await Promise.all(hashes.map((h) => fresh.getObject(h)));
    expect(found.every((o) => o !== null)).toBe(true);
  });
});
