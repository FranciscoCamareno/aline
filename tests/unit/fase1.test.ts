import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import {
  DexieDiagnostics,
  MAX_DIAGNOSTIC_ENTRIES,
  MAX_MESSAGE_LENGTH,
} from '../../src/adapters/indexeddb/DexieDiagnostics.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { MIME, VaultService } from '../../src/application/VaultService.ts';
import {
  backupManifestSchema,
  catalogSchema,
  formatJsonSchemas,
  headsFileSchema,
} from '../../src/domain/format.ts';
import { serializeNoteMarkdown } from '../../src/domain/frontmatter.ts';
import { vaultSchema } from '../../src/domain/vault.ts';
import { base64ToBytes } from '../../src/shared/base64.ts';
import { setSha256Implementation, sha256Hex, utf8Encode } from '../../src/shared/hash.ts';

let dbName: string;

async function openVault() {
  const db = new VaultDatabase(dbName);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  return { db, repo, service: new VaultService(repo) };
}

beforeEach(() => {
  dbName = `fase1-${crypto.randomUUID()}`;
});

describe('formato abierto v1 (RNF-09)', () => {
  it('los JSON Schema publicados coinciden con los esquemas del dominio', () => {
    const dir = join(import.meta.dirname, '..', '..', 'docs', 'formato', 'schemas', 'v1');
    for (const [name, schema] of Object.entries(formatJsonSchemas())) {
      const published: unknown = JSON.parse(readFileSync(join(dir, `${name}.schema.json`), 'utf8'));
      expect(published, `${name}: ejecutar node scripts/export-schemas.ts`).toEqual(schema);
    }
  });

  it('el almacén creado cumple vault.json', async () => {
    const { repo } = await openVault();
    expect(vaultSchema.safeParse(await repo.getVault()).success).toBe(true);
  });

  it('valida catálogo, cabezas y manifiesto de ejemplo', async () => {
    const { repo, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const vault = await repo.getVault();
    const device = await repo.getDeviceState();
    const now = new Date().toISOString();
    expect(
      catalogSchema.parse({
        schemaVersion: 1,
        vaultId: vault.id,
        deviceId: device.deviceId,
        generatedAt: now,
        documents: [
          {
            id: doc.id,
            kind: doc.kind,
            title: doc.title,
            folderId: null,
            tags: [],
            deleted: false,
            headRevisionIds: doc.headRevisionIds,
          },
        ],
      }),
    ).toBeTruthy();
    expect(
      headsFileSchema.parse({
        schemaVersion: 1,
        deviceId: device.deviceId,
        generatedAt: now,
        heads: { [doc.id]: doc.headRevisionIds },
      }),
    ).toBeTruthy();
    expect(
      backupManifestSchema.safeParse({
        schemaVersion: 1,
        vaultId: vault.id,
        formatVersion: 1,
        createdAt: now,
        appVersion: '0.1.0',
        files: [{ path: 'vault.json', bytes: 10, sha256: 'x' }],
      }).success,
    ).toBe(false);
  });
});

describe('compatibilidad al leer (solo lectura)', () => {
  it('una revisión de versión posterior abre en solo lectura y no se guarda encima', async () => {
    const { db, service } = await openVault();
    const doc = await service.createDocument('note', 'Futura');
    const [headId] = doc.headRevisionIds;
    const head = (await db.revisions.get(headId!))!;
    await db.revisions.put({ ...head, schemaVersion: 2 as 1 });

    const fresh = new VaultService(new DexieVaultRepository(new VaultDatabase(dbName)));
    const note = await fresh.openNote(doc.id);
    expect(note.readOnly).toBe('unsupported-version');
    await expect(fresh.saveNote(note.session, 'cambio')).rejects.toMatchObject({
      code: 'unsupported-version',
    });
    await expect(fresh.renameDocument(doc.id, 'Otro')).rejects.toMatchObject({
      code: 'unsupported-version',
    });
    expect(await db.revisions.count()).toBe(1);
  });

  it('un frontmatter de versión posterior abre en solo lectura y el renombrado se rechaza', async () => {
    const { repo, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const text = serializeNoteMarkdown({ schemaVersion: 2, id: doc.id, title: 'N', tags: [] }, 'x');
    const bytes = utf8Encode(text);
    const hash = await sha256Hex(bytes);
    await repo.commit({
      documentId: doc.id,
      kind: 'note',
      operation: 'external',
      knownHeads: doc.headRevisionIds,
      metadata: { kind: 'note', title: 'N', folderId: null, tags: [], deleted: false },
      contentRefs: { body: hash, extensions: null, assets: [] },
      blobs: [{ hash, mimeType: MIME.markdown, byteLength: bytes.byteLength, bytes }],
    });
    const fresh = new VaultService(new DexieVaultRepository(new VaultDatabase(dbName)));
    expect((await fresh.openNote(doc.id)).readOnly).toBe('unsupported-version');
    await expect(fresh.renameDocument(doc.id, 'Otro')).rejects.toMatchObject({
      code: 'unsupported-version',
    });
  });

  it('un sidecar de versión posterior o una escena nueva dejan el lienzo en solo lectura', async () => {
    const { db, repo, service } = await openVault();
    const doc = await service.createDocument('canvas', 'L');
    const head = (await db.revisions.get(doc.headRevisionIds[0]!))!;

    const sidecar = utf8Encode(JSON.stringify({ schemaVersion: 2, documentId: doc.id }));
    const sidecarHash = await sha256Hex(sidecar);
    const result = await repo.commit({
      documentId: doc.id,
      kind: 'canvas',
      operation: 'external',
      knownHeads: doc.headRevisionIds,
      metadata: head.metadata,
      contentRefs: { ...head.contentRefs, extensions: sidecarHash },
      blobs: [
        {
          hash: sidecarHash,
          mimeType: MIME.extensions,
          byteLength: sidecar.byteLength,
          bytes: sidecar,
        },
      ],
    });
    const fresh = new VaultService(new DexieVaultRepository(new VaultDatabase(dbName)));
    expect((await fresh.openCanvas(doc.id)).readOnly).toBe('unsupported-version');

    const scene = utf8Encode(JSON.stringify({ type: 'excalidraw', version: 3, elements: [] }));
    const sceneHash = await sha256Hex(scene);
    await repo.commit({
      documentId: doc.id,
      kind: 'canvas',
      operation: 'external',
      knownHeads: [result.revision.id],
      metadata: head.metadata,
      contentRefs: { ...head.contentRefs, body: sceneHash },
      blobs: [
        { hash: sceneHash, mimeType: MIME.excalidraw, byteLength: scene.byteLength, bytes: scene },
      ],
    });
    const fresh2 = new VaultService(new DexieVaultRepository(new VaultDatabase(dbName)));
    const canvas = await fresh2.openCanvas(doc.id);
    expect(canvas.readOnly).toBe('unsupported-version');
    await expect(
      fresh2.saveCanvas(canvas.session, { sceneJson: '{}', assets: [] }),
    ).rejects.toMatchObject({ code: 'unsupported-version' });
  });

  it('un sidecar corrupto se marca como contenido inválido', async () => {
    const { db, repo, service } = await openVault();
    const doc = await service.createDocument('canvas', 'L');
    const head = (await db.revisions.get(doc.headRevisionIds[0]!))!;
    const junk = utf8Encode('{no es json');
    const hash = await sha256Hex(junk);
    await repo.commit({
      documentId: doc.id,
      kind: 'canvas',
      operation: 'external',
      knownHeads: doc.headRevisionIds,
      metadata: head.metadata,
      contentRefs: { ...head.contentRefs, extensions: hash },
      blobs: [{ hash, mimeType: MIME.extensions, byteLength: junk.byteLength, bytes: junk }],
    });
    const fresh = new VaultService(new DexieVaultRepository(new VaultDatabase(dbName)));
    const canvas = await fresh.openCanvas(doc.id);
    expect(canvas.readOnly).toBe('invalid-content');
    expect(canvas.extensions.documentId).toBe(doc.id);
  });

  it('un documento compatible no queda en solo lectura', async () => {
    const { service } = await openVault();
    const note = await service.createDocument('note', 'N');
    const canvas = await service.createDocument('canvas', 'L');
    expect((await service.openNote(note.id)).readOnly).toBeNull();
    expect((await service.openCanvas(canvas.id)).readOnly).toBeNull();
  });
});

describe('registro de diagnóstico (RNF-13)', () => {
  it('rota por tamaño conservando las entradas más recientes', async () => {
    const { db } = await openVault();
    const log = new DexieDiagnostics(db);
    for (let i = 0; i < MAX_DIAGNOSTIC_ENTRIES + 50; i++)
      log.record('info', 'prueba', `entrada ${i}`);
    log.record('error', 'x'.repeat(200), 'y'.repeat(MAX_MESSAGE_LENGTH * 2));
    await log.flush();
    expect(await db.diagnostics.count()).toBe(MAX_DIAGNOSTIC_ENTRIES);
    const [newest, second] = await log.list(2);
    expect(newest!.level).toBe('error');
    expect(newest!.message).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(newest!.code).toHaveLength(64);
    expect(second!.message).toBe(`entrada ${MAX_DIAGNOSTIC_ENTRIES + 49}`);
  });
});

describe('preferencias del dispositivo y exportación de emergencia', () => {
  it('recuerda el último documento abierto', async () => {
    const a = await openVault();
    const doc = await a.service.createDocument('note', 'N');
    expect(await a.service.lastOpenedDocumentId()).toBeNull();
    await a.service.rememberLastOpened(doc.id);
    a.db.close();
    const b = await openVault();
    expect(await b.service.lastOpenedDocumentId()).toBe(doc.id);
  });

  it('exporta documentos, revisiones y blobs recuperables byte a byte', async () => {
    const { db, service } = await openVault();
    const doc = await service.createDocument('note', 'N');
    const note = await service.openNote(doc.id);
    await service.saveNote(note.session, 'contenido ñ ✓');
    await service.createDocument('canvas', 'L');

    const data = await service.exportEmergency();
    expect(data.kind).toBe('mindnote-emergency-export');
    expect(data.snapshot.documents).toHaveLength(2);
    expect(data.snapshot.revisions).toHaveLength(await db.revisions.count());
    expect(data.blobs).toHaveLength(await db.blobs.count());
    expect(data.missingBlobs).toEqual([]);
    for (const blob of data.blobs) {
      expect(await sha256Hex(base64ToBytes(blob.base64))).toBe(blob.hash);
    }
  });
});

describe('implementación de hash intercambiable', () => {
  it('usa la implementación instalada y vuelve a Web Crypto al quitarla', async () => {
    const bytes = utf8Encode('abc');
    const expected = await sha256Hex(bytes);
    setSha256Implementation(async () => 'f'.repeat(64));
    try {
      expect(await sha256Hex(bytes)).toBe('f'.repeat(64));
    } finally {
      setSha256Implementation(null);
    }
    expect(await sha256Hex(bytes)).toBe(expected);
  });
});
