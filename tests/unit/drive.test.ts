import { describe, expect, it } from 'vitest';
import { DriveClient, RESUMABLE_THRESHOLD } from '../../src/adapters/drive/driveApi.ts';
import {
  createDriveVault,
  DriveRemoteStore,
  listDriveVaults,
} from '../../src/adapters/drive/DriveRemoteStore.ts';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieSyncStore } from '../../src/adapters/indexeddb/DexieSyncStore.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { SyncEngine, VaultMismatchError } from '../../src/application/SyncEngine.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { RemoteError } from '../../src/ports/RemoteStore.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../../src/shared/hash.ts';
import { error, FakeDrive } from './fakeDrive.ts';

interface Device {
  repo: DexieVaultRepository;
  service: VaultService;
  engine: SyncEngine;
  store: DriveRemoteStore;
}

/** Un «dispositivo» con su IndexedDB y su cliente de Drive; el primero crea el almacén. */
async function device(drive: FakeDrive, from?: Device, now?: () => number): Promise<Device> {
  const db = new VaultDatabase(`drive-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  const client = new DriveClient(drive.fetch, () => drive.token);
  let rootId: string;
  if (from) {
    await repo.importContent({
      vault: await from.repo.getVault(),
      documents: [],
      revisions: [],
      blobs: new Map(),
      controls: [],
    });
    const [entry] = await listDriveVaults(client);
    rootId = entry!.folderId;
  } else {
    await repo.init('Almacén en Drive');
    rootId = (await createDriveVault(client, await repo.getVault())).folderId;
  }
  const service = new VaultService(repo);
  const store = new DriveRemoteStore(client, rootId, now);
  const engine = new SyncEngine({
    target: 'drive',
    remote: store,
    local: new DexieSyncStore(db),
    reader: repo,
    importExternal: (doc, parent, bytes) => service.importExternalNote(doc, parent, bytes),
    sleep: async () => undefined,
  });
  return { repo, service, engine, store };
}

async function body(d: Device, id: string) {
  return (await d.service.openNote(id)).body;
}

async function edit(d: Device, id: string, text: string) {
  const note = await d.service.openNote(id);
  return d.service.saveNote(note.session, text);
}

describe('Google Drive (plan 4.5) contra una simulación de la API', () => {
  it('tres dispositivos convergen; objetos, revisiones y copias se identifican por appProperties', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
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
    expect((await a.engine.runCycle()).pushedRevisions).toBe(4);

    const vaultId = (await a.repo.getVault()).id;
    expect(drive.byProperty('mindnote', 'vault')[0]?.name).toBe('Aline - Almacén en Drive');
    expect(drive.byProperty('mindnote', 'revision')).toHaveLength(4);
    expect(drive.byProperty('hash', hash)[0]?.name).toBe(`${hash}.png`);
    expect(drive.byProperty('mindnote', 'readable')).toHaveLength(2);
    expect(
      [...drive.files.values()].every(
        (f) => !f.appProperties?.['vaultId'] || f.appProperties['vaultId'] === vaultId,
      ),
    ).toBe(true);

    const b = await device(drive, a);
    const c = await device(drive, a);
    for (const d of [b, c]) {
      expect((await d.engine.runCycle()).rejected).toEqual([]);
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
    expect(
      drive.byProperty('mindnote', 'index').filter((f) => f.name.endsWith('.json')),
    ).toHaveLength(4); // 3 heads + catalog
    // Sin duplicados de objetos aunque tres equipos hayan sincronizado.
    expect(drive.byProperty('hash', hash)).toHaveLength(1);
  });

  it('conflictos sin red se conservan y la resolución se propaga (CA-14)', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    const note = await a.service.createDocument('note', 'Compartida');
    await a.engine.runCycle();
    const b = await device(drive, a);
    await b.engine.runCycle();
    await edit(a, note.id, 'versión del PC');
    await edit(b, note.id, 'versión del iPad');
    await a.engine.runCycle();
    expect((await b.engine.runCycle()).conflicts).toEqual([note.id]);
    expect((await a.engine.runCycle()).conflicts).toEqual([note.id]);
    await a.service.resolveConflict(note.id, { kind: 'merge', body: 'PC + iPad' });
    await a.engine.runCycle();
    await b.engine.runCycle();
    expect(await body(b, note.id)).toBe('PC + iPad');
  });

  it('sin cambios, un ciclo solo consulta el feed; un cursor inválido reconcilia todo', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.service.createDocument('note', 'N');
    await a.engine.runCycle();
    const b = await device(drive, a);
    await b.engine.runCycle();

    drive.requests = [];
    await b.engine.runCycle();
    const lists = drive.requests.filter((r) => r.path === '/drive/v3/files');
    // vault.json + copias legibles; ni revisiones ni controles se relistan.
    expect(lists.length).toBeLessThanOrEqual(2);
    expect(drive.requests.some((r) => r.path === '/drive/v3/changes')).toBe(true);

    const note2 = await a.service.createDocument('note', 'Nueva');
    await a.engine.runCycle();
    const db = b.repo.db;
    await new DexieSyncStore(db).setSyncState('drive', {
      cursor: '99999',
      lastPullAt: null,
      lastPushAt: null,
    });
    await b.engine.runCycle();
    expect(await b.repo.getDocument(note2.id)).toBeDefined();
  });

  it('no activa una revisión cuyo objeto falta; la completa cuando el objeto aparece', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    const note = await a.service.createDocument('note', 'N');
    await edit(a, note.id, 'contenido');
    await a.engine.runCycle();
    const b = await device(drive, a);
    await b.engine.runCycle();

    const saved2 = await edit(a, note.id, 'segunda versión');
    await a.engine.runCycle();
    const object = drive.byProperty('hash', saved2.revision.contentRefs.body!)[0]!;
    object.trashed = true; // subida parcial vista desde B
    const r1 = await b.engine.runCycle();
    expect(r1.rejected).toContainEqual({
      revisionId: saved2.revision.id,
      reason: 'missing-object',
    });
    expect(await body(b, note.id)).toBe('contenido');

    object.trashed = false;
    drive.edit(object.id, object.bytes); // reaparece: genera un cambio en el feed
    await b.engine.runCycle();
    expect(await body(b, note.id)).toBe('segunda versión');
  });

  it('una respuesta perdida no duplica la revisión al reintentar', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.service.createDocument('note', 'N');
    let lose = true;
    const realFetch = drive.fetch;
    const client = new DriveClient(
      async (input, init) => {
        const response = await realFetch(input, init);
        if (lose && drive.byProperty('mindnote', 'revision').length === 1) {
          lose = false;
          throw new TypeError('Failed to fetch');
        }
        return response;
      },
      () => drive.token,
    );
    const store = new DriveRemoteStore(client, drive.byProperty('mindnote', 'vault')[0]!.id);
    const db = a.repo.db;
    const engine = new SyncEngine({
      target: 'drive',
      remote: store,
      local: new DexieSyncStore(db),
      reader: a.repo,
      sleep: async () => undefined,
    });
    await engine.runCycle();
    expect(drive.byProperty('mindnote', 'revision')).toHaveLength(1);
    expect(await engine.pendingCount()).toBe(0);
  });

  it('una carpeta de Drive de otro almacén no se mezcla', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.engine.runCycle();
    const db = new VaultDatabase(`drive-${crypto.randomUUID()}`);
    const repo = new DexieVaultRepository(db);
    await repo.init('Otro');
    const client = new DriveClient(drive.fetch, () => drive.token);
    const store = new DriveRemoteStore(client, drive.byProperty('mindnote', 'vault')[0]!.id);
    const engine = new SyncEngine({
      target: 'drive',
      remote: store,
      local: new DexieSyncStore(db),
      reader: repo,
      sleep: async () => undefined,
    });
    await expect(engine.runCycle()).rejects.toBeInstanceOf(VaultMismatchError);
    expect(drive.byProperty('vaultId', (await repo.getVault()).id)).toEqual([]);
  });

  it('un borrado definitivo se propaga por los controles y no resucita', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    const doc = await a.service.createDocument('note', 'Temporal');
    await a.engine.runCycle();
    const b = await device(drive, a);
    await b.engine.runCycle();
    await a.service.trashDocument(doc.id);
    await a.engine.runCycle();
    await b.engine.runCycle();
    await a.service.purgeDocument(doc.id);
    await a.engine.runCycle();
    expect(drive.byProperty('mindnote', 'control')).toHaveLength(1);
    await b.engine.runCycle();
    await a.engine.runCycle();
    expect(await a.repo.getDocument(doc.id)).toBeUndefined();
    expect(await b.repo.getDocument(doc.id)).toBeUndefined();
  });

  it('importa la edición de una copia legible que conserva el archivo', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    const note = await a.service.createDocument('note', 'Editable');
    const saved = await edit(a, note.id, 'original');
    await a.engine.runCycle();
    const copy = drive
      .byProperty('revisionId', saved.revision.id)
      .find((f) => f.name.endsWith('.md'))!;
    drive.edit(copy.id, utf8Encode(utf8Decode(copy.bytes).replace('original', 'editado en Drive')));
    expect((await a.engine.runCycle()).externalEdits).toBe(1);
    expect(await body(a, note.id)).toBe('editado en Drive');
    expect((await a.engine.runCycle()).externalEdits).toBe(0);
  });

  it('clasifica los errores de Drive y respeta Retry-After', async () => {
    const drive = new FakeDrive();
    const client = new DriveClient(drive.fetch, () => drive.token);
    const cases: Array<[Response, RemoteError['kind'], number | null]> = [
      [error(401, 'authError', 'x'), 'auth', null],
      [error(403, 'userRateLimitExceeded', 'x', 7), 'transient', 7],
      [error(403, 'storageQuotaExceeded', 'x'), 'quota', null],
      [error(403, 'insufficientFilePermissions', 'x'), 'permission', null],
      [error(404, 'notFound', 'x'), 'not-found', null],
      [error(429, 'rateLimitExceeded', 'x', 2), 'transient', 2],
      [error(503, 'backendError', 'x'), 'transient', null],
    ];
    for (const [response, kind, retryAfter] of cases) {
      drive.hook = () => response;
      const failure = await client.list('trashed = false').catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(RemoteError);
      expect((failure as RemoteError).kind).toBe(kind);
      expect((failure as RemoteError).retryAfter).toBe(retryAfter);
    }
    drive.hook = null;
    const offline = new DriveClient(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => 't',
    );
    expect(
      ((await offline.list('trashed = false').catch((e: unknown) => e)) as RemoteError).kind,
    ).toBe('offline');
    // Sin token (vencido o sin autorizar) no se hace ninguna petición.
    const before = drive.requests.length;
    const noToken = new DriveClient(drive.fetch, () => null);
    expect(
      ((await noToken.list('trashed = false').catch((e: unknown) => e)) as RemoteError).kind,
    ).toBe('auth');
    expect(drive.requests.length).toBe(before);
  });

  it('usa subida reanudable por encima del umbral y multipart por debajo', async () => {
    const drive = new FakeDrive();
    const client = new DriveClient(drive.fetch, () => drive.token);
    const big = new Uint8Array(RESUMABLE_THRESHOLD + 10).fill(7);
    const meta = {
      name: 'grande.bin',
      parents: ['root'],
      mimeType: 'application/octet-stream',
      appProperties: { mindnote: 'object', vaultId: 'v', hash: 'h' },
    };
    const file = await client.createFile(meta, big);
    expect(drive.files.get(file.id)?.bytes.byteLength).toBe(big.byteLength);
    expect(drive.requests.some((r) => r.method === 'PUT')).toBe(true);
    const small = await client.createFile({ ...meta, name: 'p.bin' }, utf8Encode('hola ñ'));
    expect(utf8Decode(drive.files.get(small.id)!.bytes)).toBe('hola ñ');
  });
});
