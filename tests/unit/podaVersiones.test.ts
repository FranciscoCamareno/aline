import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { filesToVault, vaultToFiles } from '../../src/application/vaultFormat.ts';
import { VaultService } from '../../src/application/VaultService.ts';

async function vaultWithVersions() {
  const db = new VaultDatabase(`poda-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  const service = new VaultService(repo);
  const doc = await service.createDocument('note', 'Plan');
  const opened = await service.openNote(doc.id);
  // «uno» vuelve a guardarse más tarde: dos versiones comparten ese objeto.
  for (const body of ['uno', 'dos'.repeat(500), 'uno', 'tres']) {
    await service.saveNote(opened.session, body);
  }
  const other = await service.createDocument('note', 'Copia');
  await service.saveNote((await service.openNote(other.id)).session, 'otra');
  return { db, repo, service, doc };
}

describe('espacio y poda de versiones (plan 9.20, RF-46, CA-32)', () => {
  it('mide el espacio y lo que libera cada versión, sin contar lo compartido', async () => {
    const { service, doc } = await vaultWithVersions();
    const history = await service.listHistory(doc.id);
    const space = await service.versionSpace(doc.id);
    expect(space.totalBytes).toBeGreaterThan(1500);
    // Del más reciente al más antiguo: tres, uno (otra vez), dos, uno y la creación.
    const [tres, unoOtraVez, dos, uno] = history.map((h) => h.revisionId);
    // «dos» es la más grande y solo la usa esa versión; las dos «uno» comparten su objeto.
    expect(space.freeableBytes[dos!]).toBeGreaterThan(1500);
    expect(space.freeableBytes[uno!]).toBe(0);
    expect(space.freeableBytes[unoOtraVez!]).toBe(0);
    expect(space.freeableBytes[tres!]).toBeGreaterThan(0);
  });

  it('eliminar una versión antigua la quita del historial, baja el espacio y deja un control', async () => {
    const { db, service, doc } = await vaultWithVersions();
    const [, , dos] = (await service.listHistory(doc.id)).map((h) => h.revisionId);
    const before = await service.versionSpace(doc.id);
    const result = await service.pruneVersions(doc.id, [dos!]);
    expect(result).toMatchObject({ revisions: 1 });
    expect(result.freedBytes).toBe(before.freeableBytes[dos!]);
    expect((await service.listHistory(doc.id)).map((h) => h.revisionId)).not.toContain(dos);
    expect((await service.versionSpace(doc.id)).totalBytes).toBeLessThan(before.totalBytes);
    expect((await db.controls.toArray()).at(-1)!.revisionIds).toEqual([dos]);
    // El documento sigue abriéndose con su versión vigente.
    expect((await service.openNote(doc.id)).body).toBe('tres');
  });

  it('nunca elimina la versión vigente ni versiones de otro documento', async () => {
    const { service, doc } = await vaultWithVersions();
    const head = (await service.listDocuments()).find((d) => d.id === doc.id)!.headRevisionIds[0]!;
    const other = (await service.listDocuments()).find((d) => d.title === 'Copia')!;
    const foreign = (await service.listHistory(other.id))[0]!.revisionId;
    expect(await service.pruneVersions(doc.id, [head, foreign])).toEqual({
      revisions: 0,
      freedBytes: 0,
    });
    expect(await service.listHistory(doc.id)).toHaveLength(5);
  });

  it('el formato abierto no resucita una versión eliminada', async () => {
    const { service, doc } = await vaultWithVersions();
    const [, , dos] = (await service.listHistory(doc.id)).map((h) => h.revisionId);
    await service.pruneVersions(doc.id, [dos!]);
    const files = vaultToFiles(await service.exportContent(), { deviceId: crypto.randomUUID() });
    const reopened = await filesToVault(files);
    expect(reopened.content.revisions.some((r) => r.id === dos)).toBe(false);
    expect(reopened.content.controls.some((c) => c.revisionIds.includes(dos!))).toBe(true);
  });
});
