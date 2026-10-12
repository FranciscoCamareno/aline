import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { diffLines } from '../../src/shared/diff.ts';

/**
 * Plan 2.7: un fallo en cualquier etapa del guardado no deja estados parciales ni pierde la
 * versión anterior; una cuota agotada se informa como tal y nunca como guardado correcto.
 */
async function setup() {
  const db = new VaultDatabase(`robustez-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  const service = new VaultService(repo);
  const doc = await service.createDocument('note', 'N');
  const note = await service.openNote(doc.id);
  await service.saveNote(note.session, 'versión buena');
  return { db, service, doc, session: note.session };
}

async function snapshot(db: VaultDatabase) {
  return {
    documents: await db.documents.toArray(),
    revisions: await db.revisions.count(),
    blobs: await db.blobs.count(),
    history: await db.historyIndex.count(),
    outbox: await db.outbox.count(),
    device: await db.deviceSettings.get('device'),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('fallos inyectados en cada etapa del commit', () => {
  const stages = [
    ['blobs', 'add'],
    ['revisions', 'add'],
    ['documents', 'put'],
    ['historyIndex', 'add'],
    ['outbox', 'add'],
    ['deviceSettings', 'put'],
  ] as const;

  for (const [table, method] of stages) {
    it(`un fallo en ${table}.${method} no deja escrituras parciales`, async () => {
      const { db, service, doc, session } = await setup();
      const before = await snapshot(db);
      const target = db[table] as unknown as Record<string, (...args: unknown[]) => unknown>;
      vi.spyOn(target, method).mockImplementation(() =>
        Promise.reject(new Error('disco simulado')),
      );

      await expect(service.saveNote(session, 'cambio que falla')).rejects.toMatchObject({
        code: 'storage-failure',
      });
      vi.restoreAllMocks();

      expect(await snapshot(db)).toEqual(before);
      // La versión anterior sigue íntegra y un reintento posterior funciona.
      expect((await service.openNote(doc.id)).body).toBe('versión buena');
      await service.saveNote(session, 'reintento');
      expect((await service.openNote(doc.id)).body).toBe('reintento');
    });
  }

  it('una cuota agotada se informa como «quota-exceeded» y no guarda nada', async () => {
    const { db, service, session } = await setup();
    const before = await snapshot(db);
    const revisions = db.revisions as unknown as Record<string, (...args: unknown[]) => unknown>;
    vi.spyOn(revisions, 'add').mockImplementation(() =>
      Promise.reject(new DOMException('Sin espacio', 'QuotaExceededError')),
    );
    await expect(service.saveNote(session, 'no cabe')).rejects.toMatchObject({
      code: 'quota-exceeded',
    });
    vi.restoreAllMocks();
    expect(await snapshot(db)).toEqual(before);
  });
});

describe('borrador del trazo en curso', () => {
  it('se guarda, se recupera una sola vez y se puede descartar', async () => {
    const { service, doc } = await setup();
    const element = {
      id: 'trazo',
      type: 'freedraw',
      version: 3,
      points: [
        [0, 0],
        [5, 5],
      ],
    };
    await service.saveStrokeDraft(doc.id, element);
    const draft = await service.takeStrokeDraft(doc.id);
    expect(draft?.element).toEqual(element);
    expect(await service.takeStrokeDraft(doc.id)).toBeNull();

    await service.saveStrokeDraft(doc.id, element);
    await service.clearStrokeDraft(doc.id);
    expect(await service.takeStrokeDraft(doc.id)).toBeNull();
  });
});

describe('diferencias por líneas', () => {
  it('marca líneas comunes, añadidas y quitadas', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
    ]);
    expect(diffLines('', 'nuevo')).toEqual([
      { op: 'del', text: '' },
      { op: 'add', text: 'nuevo' },
    ]);
  });
});
