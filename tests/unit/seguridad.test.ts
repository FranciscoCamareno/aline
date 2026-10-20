import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DriveClient,
  isUploadSession,
  RESUMABLE_THRESHOLD,
} from '../../src/adapters/drive/driveApi.ts';
import {
  createDriveVault,
  DriveRemoteStore,
  driveSuccessor,
  listDriveVaults,
  markDriveSuperseded,
  readDriveEncryption,
  trashDriveFolder,
} from '../../src/adapters/drive/DriveRemoteStore.ts';
import { DRIVE_SCOPE, GoogleAuth } from '../../src/adapters/drive/GoogleAuth.ts';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieSyncStore } from '../../src/adapters/indexeddb/DexieSyncStore.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { SyncEngine } from '../../src/application/SyncEngine.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import type { DriveConnection } from '../../src/app/composition/remotes.ts';
import type { AppServices } from '../../src/app/services.ts';
import { SyncRuntime, type RemoteStatus } from '../../src/app/syncRuntime.ts';
import { checkRevision } from '../../src/domain/compat.ts';
import { encryptionFileSchema, type DriveEncryptionChoice } from '../../src/domain/encryption.ts';
import { RemoteError } from '../../src/ports/RemoteStore.ts';
import {
  createEncryption,
  deriveVaultKeys,
  generateRecoveryCode,
  VaultCipher,
} from '../../src/shared/crypto.ts';
import { utf8Encode } from '../../src/shared/hash.ts';
import { FakeDrive } from './fakeDrive.ts';

/**
 * Regresión de la auditoría de seguridad del 13/10/2026 (informe fuera del repositorio):
 * los recorridos AUD-01 a AUD-06 que allí reproducían el defecto, con el criterio de cierre.
 */

const FAST = { iterations: 1000 };
const PASSWORD = 'contraseña sintética larga';
const SECRET_TEXT = 'CONTENIDO_PRIVADO_SINTÉTICO';

const opened: VaultDatabase[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) await db.delete();
});

/** SyncRuntime real con IndexedDB en memoria y Drive simulado (sin GIS ni Google). */
async function harness() {
  vi.stubGlobal('navigator', {});
  const db = new VaultDatabase(`seguridad-${crypto.randomUUID()}`);
  opened.push(db);
  const repo = new DexieVaultRepository(db);
  await repo.init('Almacén sintético');
  const vault = await repo.getVault();
  const service = new VaultService(repo);
  const drive = new FakeDrive();
  const client = new DriveClient(drive.fetch, () => drive.token);
  const statuses: Array<RemoteStatus | null> = [];
  const services = { repo, service, vault, dbName: db.name, temporary: false };
  const runtime = new SyncRuntime(
    services as unknown as AppServices,
    (s) => statuses.push(s),
    () => undefined,
  );
  const connection: DriveConnection = {
    auth: {
      prepare: async () => undefined,
      connect: async () => undefined,
      disconnect: async () => undefined,
      getAccessToken: () => drive.token,
    },
    listVaults: () => listDriveVaults(client),
    createVault: async (v, choice) => {
      if (choice.mode === 'plain') {
        return { entry: await createDriveVault(client, v, null), keys: null };
      }
      const { file, raw } = await createEncryption(
        v.id,
        choice.password,
        choice.recoveryCode,
        FAST,
      );
      return { entry: await createDriveVault(client, v, file), keys: await deriveVaultKeys(raw) };
    },
    remote: (folderId, vaultId, keys) =>
      new DriveRemoteStore(client, folderId, {
        cipher: keys ? new VaultCipher(keys, vaultId) : null,
      }),
    unlock: async () => {
      throw new Error('no usado');
    },
    replaceSecret: async () => undefined,
    markSuperseded: (a, b) => markDriveSuperseded(client, a, b),
    successorOf: (id) => driveSuccessor(client, id),
    trashFolder: (id) => trashDriveFolder(client, id),
  };
  (runtime as unknown as { drive: DriveConnection }).drive = connection;
  return { db, repo, vault, service, drive, client, runtime, statuses, connection };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function note(h: Harness, text: string) {
  const doc = await h.service.createDocument('note', 'Nota sintética');
  const open = await h.service.openNote(doc.id);
  await h.service.saveNote(open.session, text);
  return doc;
}

const driveText = (drive: FakeDrive) =>
  [...drive.files.values()].map((f) => new TextDecoder().decode(f.bytes)).join('\n');

const encrypted = (): DriveEncryptionChoice => ({
  mode: 'encrypted',
  password: PASSWORD,
  recoveryCode: generateRecoveryCode(),
});

/** Enlaza el runtime a una carpeta cifrada nueva con su clave, como tras conectar. */
async function bindEncrypted(h: Harness) {
  const { file, raw } = await createEncryption(h.vault.id, PASSWORD, generateRecoveryCode(), FAST);
  const root = await createDriveVault(h.client, h.vault, file);
  const internals = h.runtime as unknown as { binding: unknown; keys: unknown };
  internals.binding = {
    kind: 'drive',
    folderId: root.folderId,
    name: root.folderName,
    encrypted: true,
    connectedAt: new Date().toISOString(),
  };
  await h.repo.setDevicePreference('binding', internals.binding);
  internals.keys = await deriveVaultKeys(raw);
  return root;
}

describe('H01: elegir cifrar nunca publica en claro sin confirmación', () => {
  it('AUD-01: con una copia sin cifrar previa, connectDrive no publica nada y pide decidir', async () => {
    const h = await harness();
    const plain = await createDriveVault(h.client, h.vault, null);
    await note(h, SECRET_TEXT);
    const files = h.drive.files.size;

    const result = await h.runtime.connectDrive(encrypted());
    expect(result).toEqual({
      existingPlain: expect.objectContaining({ folderId: plain.folderId }),
    });
    expect(h.drive.files.size).toBe(files);
    expect(driveText(h.drive)).not.toContain(SECRET_TEXT);
    expect(await h.repo.getDevicePreference('binding')).toBeFalsy();
  });

  it('AUD-01: «crear una carpeta cifrada nueva» sube todo cifrado y sustituye la sin cifrar', async () => {
    const h = await harness();
    const plain = await createDriveVault(h.client, h.vault, null);
    await note(h, SECRET_TEXT);
    const choice = encrypted();
    const result = await h.runtime.connectDrive(choice);
    if (!('existingPlain' in result)) throw new Error('se esperaba existingPlain');

    await h.runtime.createDriveVault(choice, result.existingPlain.folderId);
    expect(driveText(h.drive)).not.toContain(SECRET_TEXT);
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'ok', encrypted: true, previousFolder: true });
    expect(await driveSuccessor(h.client, plain.folderId)).not.toBeNull();
  });

  it('AUD-01: usar la carpeta sin cifrar solo ocurre tras aceptarlo expresamente', async () => {
    const h = await harness();
    await createDriveVault(h.client, h.vault, null);
    await note(h, SECRET_TEXT);
    const result = await h.runtime.connectDrive(encrypted());
    if (!('existingPlain' in result)) throw new Error('se esperaba existingPlain');
    expect(driveText(h.drive)).not.toContain(SECRET_TEXT);

    await h.runtime.useExistingPlainDrive(result.existingPlain);
    expect(driveText(h.drive)).toContain(SECRET_TEXT);
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'ok', encrypted: false });
  });

  it('AUD-02: si la carpeta cifrada se sustituye por una sin cifrar, se detiene antes de publicar', async () => {
    const h = await harness();
    const old = await bindEncrypted(h);
    await h.runtime.sync();
    await note(h, SECRET_TEXT);
    const next = await createDriveVault(h.client, h.vault, null);
    await markDriveSuperseded(h.client, old.folderId, next.folderId);

    await h.runtime.sync();
    await h.runtime.sync();
    expect(h.statuses.at(-1)?.phase).toBe('needs-confirm');
    expect(driveText(h.drive)).not.toContain(SECRET_TEXT);
    expect(await h.repo.getDevicePreference('binding')).toMatchObject({
      folderId: old.folderId,
      encrypted: true,
    });

    // Solo al aceptarlo pasa a la carpeta sin cifrar y publica lo pendiente.
    await h.runtime.acceptPlainRelocation();
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'ok', encrypted: false });
    expect(driveText(h.drive)).toContain(SECRET_TEXT);
  });

  it('AUD-02: volver a cifrar crea otra carpeta cifrada sin publicar nada en claro', async () => {
    const h = await harness();
    const old = await bindEncrypted(h);
    await h.runtime.sync();
    await note(h, SECRET_TEXT);
    const next = await createDriveVault(h.client, h.vault, null);
    await markDriveSuperseded(h.client, old.folderId, next.folderId);
    await h.runtime.sync();
    expect(h.statuses.at(-1)?.phase).toBe('needs-confirm');

    await h.runtime.reencryptAfterPlainRelocation(encrypted());
    expect(driveText(h.drive)).not.toContain(SECRET_TEXT);
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'ok', encrypted: true });
    expect(await driveSuccessor(h.client, next.folderId)).not.toBeNull();
  });

  it('la reubicación sigue supersededBy, no cualquier carpeta con el mismo id de almacén', async () => {
    const h = await harness();
    const old = await bindEncrypted(h);
    await h.runtime.sync();
    // Dos carpetas cifradas candidatas; solo una es la sustituta declarada.
    const { file } = await createEncryption(h.vault.id, PASSWORD, generateRecoveryCode(), FAST);
    await createDriveVault(h.client, h.vault, file);
    const declared = await createDriveVault(h.client, h.vault, file);
    await markDriveSuperseded(h.client, old.folderId, declared.folderId);

    await h.runtime.sync();
    await vi.waitFor(() => expect(h.statuses.at(-1)?.phase).toBe('needs-key'));
    expect(await h.repo.getDevicePreference('binding')).toMatchObject({
      folderId: declared.folderId,
    });
  });

  it('sin supersededBy y con varias candidatas no elige ninguna', async () => {
    const h = await harness();
    const old = await bindEncrypted(h);
    await h.runtime.sync();
    const { file } = await createEncryption(h.vault.id, PASSWORD, generateRecoveryCode(), FAST);
    await createDriveVault(h.client, h.vault, file);
    await createDriveVault(h.client, h.vault, file);
    await trashDriveFolder(h.client, old.folderId);

    await h.runtime.sync();
    expect(h.statuses.at(-1)?.phase).toBe('unavailable');
    expect(await h.repo.getDevicePreference('binding')).toMatchObject({ folderId: old.folderId });
  });
});

describe('H05: una revisión remota con versión futura no detiene la sincronización', () => {
  it('AUD-04: el sobre incompleto se rechaza y el ciclo sigue con las revisiones válidas', async () => {
    const h = await harness();
    const root = await createDriveVault(h.client, h.vault, null);
    const id = crypto.randomUUID();
    await h.client.createFile(
      {
        name: `${id}.json`,
        parents: [root.folderId],
        mimeType: 'application/json',
        appProperties: { mindnote: 'revision', root: root.folderId, revisionId: id },
      },
      utf8Encode(JSON.stringify({ schemaVersion: 2, id })),
    );
    await note(h, 'válida');
    const engine = new SyncEngine({
      target: 'audit',
      remote: new DriveRemoteStore(h.client, root.folderId),
      local: new DexieSyncStore(h.db),
      reader: h.repo,
      sleep: async () => undefined,
    });
    const first = await engine.runCycle();
    expect(first.rejected).toEqual([{ revisionId: id, reason: 'invalid-schema' }]);
    expect(first.pushedRevisions).toBe(2); // creación y guardado de la nota válida
    expect((await engine.runCycle()).rejected).toHaveLength(1);
    expect(await h.repo.getRevision(id)).toBeUndefined();
  });

  it('una versión futura con el sobre completo se acepta en solo lectura; tipos erróneos o listas desmedidas no', () => {
    const uuid = () => crypto.randomUUID();
    const future = {
      schemaVersion: 2,
      id: uuid(),
      documentId: uuid(),
      parentIds: [],
      deviceId: uuid(),
      createdAt: new Date().toISOString(),
      operation: 'nueva-operación',
      metadata: { kind: 'note', title: 'T', folderId: null, tags: [], deleted: false, extra: 1 },
      contentRefs: { body: null, extensions: null, assets: [], futuro: [] },
      campoNuevo: true,
    };
    expect(checkRevision(future)).toBe('unsupported-version');
    expect(checkRevision({ ...future, parentIds: 'x' })).toBe('invalid-content');
    expect(checkRevision({ ...future, contentRefs: undefined })).toBe('invalid-content');
    expect(
      checkRevision({ ...future, parentIds: Array.from({ length: 1001 }, () => uuid()) }),
    ).toBe('invalid-content');
    expect(
      checkRevision({
        ...future,
        contentRefs: { body: null, extensions: null, assets: Array(10_001).fill('a'.repeat(64)) },
      }),
    ).toBe('invalid-content');
  });
});

describe('H06: descriptor de cifrado acotado antes de derivar claves', () => {
  it('AUD-03: rechaza costes y ranuras desmedidos y longitudes inesperadas', async () => {
    const { file } = await createEncryption(crypto.randomUUID(), PASSWORD, 'X', FAST);
    expect(encryptionFileSchema.safeParse(file).success).toBe(true);
    const slot = file.keys[0]!;
    const variants = [
      { ...file, keys: Array.from({ length: 1000 }, () => slot) },
      { ...file, keys: [{ ...slot, iterations: 4294967295 }] },
      { ...file, keys: [{ ...slot, iterations: 1 }] },
      { ...file, keys: [{ ...slot, salt: `${slot.salt}AAAA` }] },
      { ...file, keys: [{ ...slot, wrappedKey: 'A'.repeat(4096) }] },
    ];
    for (const v of variants) expect(encryptionFileSchema.safeParse(v).success).toBe(false);
  });

  it('un encryption.json manipulado en Drive se rechaza sin llegar a PBKDF2', async () => {
    const h = await harness();
    const { file } = await createEncryption(h.vault.id, PASSWORD, generateRecoveryCode(), FAST);
    const root = await createDriveVault(h.client, h.vault, file);
    const stored = h.drive.byProperty('mindnote', 'encryption')[0]!;
    h.drive.edit(
      stored.id,
      utf8Encode(JSON.stringify({ ...file, keys: [{ ...file.keys[0], iterations: 2 ** 32 - 1 }] })),
    );
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    await expect(readDriveEncryption(h.client, root.folderId)).rejects.toBeInstanceOf(RemoteError);
    expect(derive).not.toHaveBeenCalled();
  });
});

describe('O01: el token solo viaja a la API de subidas de Google', () => {
  it('AUD-05: una sesión reanudable de otro origen no recibe Authorization', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new DriveClient(
      async (url, init) => {
        calls.push({ url, ...(init ? { init } : {}) });
        return new Response('', {
          status: 200,
          headers: { Location: 'https://audit.invalid/session' },
        });
      },
      () => 'TOKEN_SINTÉTICO',
    );
    await expect(
      client.createFile(
        { name: 'a', parents: ['p'], mimeType: 'application/octet-stream', appProperties: {} },
        new Uint8Array(RESUMABLE_THRESHOLD + 1),
      ),
    ).rejects.toMatchObject({ kind: 'permission' });
    expect(calls).toHaveLength(1);
  });

  it('solo admite https://www.googleapis.com/upload/drive/v3/… sin credenciales', () => {
    expect(isUploadSession('https://www.googleapis.com/upload/drive/v3/files?upload_id=1')).toBe(
      true,
    );
    for (const url of [
      'http://www.googleapis.com/upload/drive/v3/files?upload_id=1',
      'https://www.googleapis.com.audit.invalid/upload/drive/v3/files',
      'https://user:pass@www.googleapis.com/upload/drive/v3/files',
      'https://www.googleapis.com/drive/v3/files',
      '/upload/drive/v3/files',
      'no es una url',
    ]) {
      expect(isUploadSession(url)).toBe(false);
    }
  });
});

describe('H07: desconectar distingue la revocación confirmada de la que no', () => {
  function stubGis(revoke: (token: string, done: (r?: unknown) => void) => void) {
    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (config: { callback: (r: unknown) => void }) => {
              const c = {
                callback: config.callback,
                requestAccessToken: () =>
                  c.callback({ access_token: 'T', expires_in: 3600, scope: DRIVE_SCOPE }),
              };
              return c;
            },
            hasGrantedAllScopes: () => true,
            revoke,
          },
        },
      },
    });
  }

  it('AUD-06: successful=false rechaza, pero el token local se olvida igualmente', async () => {
    stubGis((_t, done) => done({ successful: false, error: 'invalid_request' }));
    const auth = new GoogleAuth('cliente-público');
    await auth.connect();
    await expect(auth.disconnect()).rejects.toMatchObject({ kind: 'auth' });
    expect(auth.getAccessToken()).toBeNull();
  });

  it('successful=true resuelve; sin token o sin respuesta de Google, rechaza', async () => {
    stubGis((_t, done) => done({ successful: true }));
    const ok = new GoogleAuth('cliente-público');
    await ok.connect();
    await expect(ok.disconnect()).resolves.toBeUndefined();
    await expect(new GoogleAuth('cliente-público').disconnect()).rejects.toBeInstanceOf(
      RemoteError,
    );

    vi.useFakeTimers();
    try {
      stubGis(() => undefined); // GIS nunca llama al callback
      const silent = new GoogleAuth('cliente-público');
      await silent.connect();
      const pending = silent.disconnect();
      const check = expect(pending).rejects.toBeInstanceOf(RemoteError);
      await vi.advanceTimersByTimeAsync(20_000);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });

  it('SyncRuntime.disconnect informa si Google no confirmó y no borra datos locales', async () => {
    const h = await harness();
    await note(h, 'se queda en el equipo');
    await bindEncrypted(h);
    h.connection.auth.disconnect = async () => {
      throw new RemoteError('auth', 'revoke-unconfirmed');
    };
    expect(await h.runtime.disconnect()).toEqual({ revoked: false });
    expect(await h.repo.getDevicePreference('binding')).toBeNull();
    expect((await h.repo.listDocuments()).length).toBeGreaterThan(0);
  });
});
