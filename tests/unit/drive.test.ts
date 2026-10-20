import { describe, expect, it } from 'vitest';
import { DriveClient, RESUMABLE_THRESHOLD } from '../../src/adapters/drive/driveApi.ts';
import {
  createDriveVault,
  DriveRemoteStore,
  listDriveVaults,
  markDriveSuperseded,
  readDriveEncryption,
} from '../../src/adapters/drive/DriveRemoteStore.ts';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieSyncStore } from '../../src/adapters/indexeddb/DexieSyncStore.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { SyncEngine, VaultMismatchError } from '../../src/application/SyncEngine.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { RemoteError, type RemoteErrorCode } from '../../src/ports/RemoteStore.ts';
import {
  createEncryption,
  deriveVaultKeys,
  generateRecoveryCode,
  normalizeRecoveryCode,
  replaceSlot,
  unlockRawKey,
  VaultCipher,
  WrongSecretError,
} from '../../src/shared/crypto.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../../src/shared/hash.ts';
import { error, FakeDrive } from './fakeDrive.ts';

interface Device {
  repo: DexieVaultRepository;
  service: VaultService;
  engine: SyncEngine;
  store: DriveRemoteStore;
}

/** Iteraciones bajas solo para que las pruebas sean rápidas; la aplicación usa 600 000. */
const FAST = { iterations: 1000 };
const PASSWORD = 'contraseña larga de prueba';

/**
 * Un «dispositivo» con su IndexedDB y su cliente de Drive; el primero crea el almacén. Con
 * `secret`, el almacén está cifrado: el primero lo crea con PASSWORD y los demás lo abren con
 * el secreto dado (contraseña o código de recuperación).
 */
async function device(
  drive: FakeDrive,
  from?: Device,
  secret?: string,
  recoveryCode = generateRecoveryCode(),
): Promise<Device> {
  const db = new VaultDatabase(`drive-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  const client = new DriveClient(drive.fetch, () => drive.token);
  let rootId: string;
  let cipher: VaultCipher | null = null;
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
    if (secret) {
      const raw = await unlockRawKey(await readDriveEncryption(client, rootId), secret);
      cipher = new VaultCipher(await deriveVaultKeys(raw), (await repo.getVault()).id);
    }
  } else {
    await repo.init('Almacén en Drive');
    const vault = await repo.getVault();
    if (secret) {
      const { file, raw } = await createEncryption(vault.id, PASSWORD, recoveryCode, FAST);
      rootId = (await createDriveVault(client, vault, file)).folderId;
      cipher = new VaultCipher(await deriveVaultKeys(raw), vault.id);
    } else {
      rootId = (await createDriveVault(client, vault, null)).folderId;
    }
  }
  const service = new VaultService(repo);
  const store = new DriveRemoteStore(client, rootId, { cipher });
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
    const cases: Array<[Response, RemoteError['kind'], RemoteErrorCode, number | null]> = [
      [error(401, 'authError', 'x'), 'auth', 'auth-expired', null],
      [error(403, 'userRateLimitExceeded', 'x', 7), 'transient', 'drive-busy', 7],
      [error(403, 'storageQuotaExceeded', 'x'), 'quota', 'drive-quota', null],
      [error(403, 'insufficientFilePermissions', 'x'), 'permission', 'drive-forbidden', null],
      [error(404, 'notFound', 'x'), 'not-found', 'drive-not-found', null],
      [error(429, 'rateLimitExceeded', 'x', 2), 'transient', 'drive-busy', 2],
      [error(503, 'backendError', 'x'), 'transient', 'drive-busy', null],
    ];
    for (const [response, kind, code, retryAfter] of cases) {
      drive.hook = () => response;
      const failure = await client.list('trashed = false').catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(RemoteError);
      expect((failure as RemoteError).kind).toBe(kind);
      expect((failure as RemoteError).code).toBe(code);
      expect((failure as RemoteError).retryAfter).toBe(retryAfter);
    }
    drive.hook = null;
    const offline = new DriveClient(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => 't',
    );
    expect(
      ((await offline.list('trashed = false').catch((e: unknown) => e)) as RemoteError).code,
    ).toBe('offline');
    // Sin token (vencido o sin autorizar) no se hace ninguna petición.
    const before = drive.requests.length;
    const noToken = new DriveClient(drive.fetch, () => null);
    expect(
      ((await noToken.list('trashed = false').catch((e: unknown) => e)) as RemoteError).code,
    ).toBe('auth-required');
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

describe('cifrado opcional en Drive (diseño §13.1)', () => {
  it('la clave se abre con la contraseña o con el código de recuperación, y con nada más', async () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const vaultId = crypto.randomUUID();
    const { file, raw } = await createEncryption(vaultId, PASSWORD, code, FAST);
    expect(await unlockRawKey(file, PASSWORD)).toEqual(raw);
    // El código se admite en minúsculas y sin guiones.
    expect(await unlockRawKey(file, code.toLowerCase().replace(/-/g, ' '))).toEqual(raw);
    expect(normalizeRecoveryCode('abco-il')).toBe('ABC011');
    await expect(unlockRawKey(file, 'otra contraseña')).rejects.toBeInstanceOf(WrongSecretError);
    // Las ranuras están ligadas al almacén: copiarlas a otro descriptor no sirve.
    await expect(
      unlockRawKey({ ...file, vaultId: crypto.randomUUID() }, PASSWORD),
    ).rejects.toBeInstanceOf(WrongSecretError);

    // Cambiar la contraseña conserva la clave (nada que volver a subir) y el código sigue valiendo.
    const changed = await replaceSlot(file, raw, 'password', 'nueva contraseña larga', FAST);
    await expect(unlockRawKey(changed, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    expect(await unlockRawKey(changed, 'nueva contraseña larga')).toEqual(raw);
    expect(await unlockRawKey(changed, code)).toEqual(raw);
  });

  it('dos equipos sincronizan cifrado y en Drive no queda nada legible', async () => {
    const drive = new FakeDrive();
    const code = generateRecoveryCode();
    const a = await device(drive, undefined, PASSWORD, code);
    const note = await a.service.createDocument('note', 'Título secreto');
    await edit(a, note.id, 'texto confidencial ñ');
    const canvas = await a.service.createDocument('canvas', 'Mapa privado');
    const c0 = await a.service.openCanvas(canvas.id);
    const image = utf8Encode('bytes de una imagen privada');
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

    // Ni el contenido, ni los títulos, ni los hashes, ni los documentos aparecen en Drive.
    const everything = [...drive.files.values()]
      .map(
        (f) => `${f.name} ${JSON.stringify(f.appProperties)} ${new TextDecoder().decode(f.bytes)}`,
      )
      .join('\n');
    for (const secret of [
      'texto confidencial',
      'Título secreto',
      'Mapa privado',
      'imagen privada',
      hash,
      note.id,
      canvas.id,
    ]) {
      expect(everything).not.toContain(secret);
    }
    expect(drive.byProperty('mindnote', 'readable')).toEqual([]);
    expect(drive.byProperty('mindnote', 'vault')[0]?.name).toBe(
      'Aline - Almacén en Drive (cifrado)',
    );
    expect(drive.byProperty('mindnote', 'revision').every((f) => f.name.endsWith('.bin'))).toBe(
      true,
    );

    // Otro equipo con el código de recuperación (que la app pide si se olvidó la contraseña).
    const b = await device(drive, a, code);
    expect((await b.engine.runCycle()).rejected).toEqual([]);
    expect(await body(b, note.id)).toBe('texto confidencial ñ');
    expect(await b.service.loadAsset(hash)).toMatchObject({ mimeType: 'image/png' });
    await edit(b, note.id, 'editado en B');
    await b.engine.runCycle();
    await a.engine.runCycle();
    expect(await body(a, note.id)).toBe('editado en B');
    // Sin duplicados: el objeto de la imagen tiene un único archivo.
    expect(drive.byProperty('mindnote', 'object').length).toBe(
      new Set(drive.byProperty('mindnote', 'object').map((f) => f.appProperties!['hash'])).size,
    );
  });

  it('un archivo cifrado alterado o movido no se activa', async () => {
    const drive = new FakeDrive();
    const a = await device(drive, undefined, PASSWORD);
    const note = await a.service.createDocument('note', 'N');
    const saved = await edit(a, note.id, 'contenido');
    await a.engine.runCycle();
    const b = await device(drive, a, PASSWORD);

    const revisionFile = drive.byProperty('revisionId', saved.revision.id)[0]!;
    const original = revisionFile.bytes;
    const tampered = original.slice();
    tampered[tampered.length - 1]! ^= 1;
    revisionFile.bytes = tampered;
    const r1 = await b.engine.runCycle();
    expect(r1.rejected).toContainEqual({ revisionId: saved.revision.id, reason: 'invalid-schema' });

    // El contenido de otra revisión copiado encima (mismo almacén y clave) tampoco vale.
    const otherRevision = drive.byProperty('mindnote', 'revision').find((f) => f !== revisionFile)!;
    drive.edit(revisionFile.id, otherRevision.bytes);
    const r2 = await b.engine.runCycle();
    expect(r2.rejected).toContainEqual({ revisionId: saved.revision.id, reason: 'invalid-schema' });

    drive.edit(revisionFile.id, original);
    await b.engine.runCycle();
    expect(await body(b, note.id)).toBe('contenido');
  });

  it('nunca escribe sin cifrar en una carpeta cifrada ni al revés', async () => {
    const drive = new FakeDrive();
    const a = await device(drive, undefined, PASSWORD);
    await a.engine.runCycle();
    const before = drive.files.size;
    const client = new DriveClient(drive.fetch, () => drive.token);
    const root = drive.byProperty('mindnote', 'vault')[0]!.id;
    const plain = new DriveRemoteStore(client, root);
    await expect(plain.readVault()).rejects.toMatchObject({ kind: 'permission' });

    const other = new FakeDrive();
    const p = await device(other);
    await p.engine.runCycle();
    const pClient = new DriveClient(other.fetch, () => other.token);
    const { raw } = await createEncryption(
      (await p.repo.getVault()).id,
      PASSWORD,
      generateRecoveryCode(),
      FAST,
    );
    const encrypted = new DriveRemoteStore(pClient, other.byProperty('mindnote', 'vault')[0]!.id, {
      cipher: new VaultCipher(await deriveVaultKeys(raw), (await p.repo.getVault()).id),
    });
    await expect(encrypted.readVault()).rejects.toMatchObject({ kind: 'permission' });
    expect(drive.files.size).toBe(before);
  });

  it('cambiar de modo: la carpeta nueva recibe todo y la antigua deja de usarse', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    const note = await a.service.createDocument('note', 'Migrada');
    await edit(a, note.id, 'antes del cambio');
    await a.engine.runCycle();
    const b = await device(drive, a);
    await b.engine.runCycle();
    const oldRoot = drive.byProperty('mindnote', 'vault')[0]!.id;

    // A crea la carpeta cifrada del mismo almacén y la llena con un destino nuevo.
    const client = new DriveClient(drive.fetch, () => drive.token);
    const vault = await a.repo.getVault();
    const { file, raw } = await createEncryption(vault.id, PASSWORD, generateRecoveryCode(), FAST);
    const created = await createDriveVault(client, vault, file);
    const cipher = new VaultCipher(await deriveVaultKeys(raw), vault.id);
    const migrate = new SyncEngine({
      target: `drive:${created.folderId}`,
      remote: new DriveRemoteStore(client, created.folderId, { cipher }),
      local: new DexieSyncStore(a.repo.db),
      reader: a.repo,
      sleep: async () => undefined,
    });
    const r = await migrate.runCycle();
    expect(r.pushedRevisions).toBe(2);
    expect(r.pulledRevisions).toBe(0); // las dos carpetas no se mezclan aunque compartan vaultId
    expect(await migrate.pendingCount()).toBe(0);
    await markDriveSuperseded(client, oldRoot, created.folderId);

    // B sigue en la carpeta antigua: deja de estar disponible y la lista ya solo ofrece la nueva.
    await expect(b.engine.runCycle()).rejects.toMatchObject({ kind: 'not-found' });
    const listed = await listDriveVaults(client);
    expect(listed.map((v) => [v.folderId, v.encrypted])).toEqual([[created.folderId, true]]);

    // B abre la carpeta nueva con la contraseña y converge; su versión local no se pierde.
    await edit(b, note.id, 'editado en B tras el cambio');
    const bRaw = await unlockRawKey(await readDriveEncryption(client, created.folderId), PASSWORD);
    const moved = new SyncEngine({
      target: `drive:${created.folderId}`,
      remote: new DriveRemoteStore(client, created.folderId, {
        cipher: new VaultCipher(await deriveVaultKeys(bRaw), vault.id),
      }),
      local: new DexieSyncStore(b.repo.db),
      reader: b.repo,
      sleep: async () => undefined,
    });
    expect((await moved.runCycle()).pushedRevisions).toBe(1);
    await migrate.runCycle();
    expect(await body(a, note.id)).toBe('editado en B tras el cambio');
  });
});
