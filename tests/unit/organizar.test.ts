import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { filesToVault, vaultToFiles } from '../../src/application/vaultFormat.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { keyBetween, planReorder, sortByKey } from '../../src/domain/order.ts';

async function fresh() {
  const db = new VaultDatabase(`organizar-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  return { repo, service: new VaultService(repo) };
}

describe('claves de orden fraccionales', () => {
  it('siempre queda una clave estrictamente entre dos, sin terminar en el dígito menor', () => {
    let low: string | null = null;
    let high: string | null = null;
    const keys: string[] = [];
    // Insertar 200 veces en el mismo hueco (el caso que más alarga las claves).
    for (let i = 0; i < 200; i++) {
      const key = keyBetween(low, high);
      if (low !== null) expect(key > low).toBe(true);
      if (high !== null) expect(key < high).toBe(true);
      expect(key.endsWith('0')).toBe(false);
      keys.push(key);
      if (i % 2) low = key;
      else high = key;
    }
    expect(new Set(keys).size).toBe(200);
    expect(() => keyBetween('b', 'a')).toThrow(RangeError);
  });

  it('ordena primero por clave y después por el orden por defecto', () => {
    const items = [
      { id: 'c', title: 'C' },
      { id: 'b', title: 'B', sortKey: 'V' },
      { id: 'a', title: 'A' },
      { id: 'd', title: 'D', sortKey: 'K' },
    ];
    expect(sortByKey(items, (x, y) => x.title.localeCompare(y.title)).map((i) => i.id)).toEqual([
      'd',
      'b',
      'a',
      'c',
    ]);
  });

  it('con hermanos ya ordenados a mano solo cambia la clave del que se mueve', () => {
    const siblings = [
      { id: 'a', sortKey: 'F' },
      { id: 'b', sortKey: 'M' },
      { id: 'c', sortKey: 'T' },
    ];
    const changes = planReorder(siblings, 'c', 1);
    expect([...changes.keys()]).toEqual(['c']);
    const key = changes.get('c')!;
    expect(key > 'F' && key < 'M').toBe(true);
  });

  it('la primera vez se numeran todos en el orden que se ve, con el movido en su sitio', () => {
    const siblings = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const changes = planReorder(siblings, 'x', 1);
    const order = [...changes].sort((p, q) => (p[1] < q[1] ? -1 : 1)).map(([id]) => id);
    expect(order).toEqual(['a', 'x', 'b', 'c']);
  });
});

describe('orden manual y archivado en el almacén (17/10/2026)', () => {
  it('reordenar y archivar crean revisiones de metadatos que los guardados conservan', async () => {
    const { service } = await fresh();
    const folder = await service.createFolder('Proyectos');
    const note = await service.createDocument('note', 'Plan');
    await service.reorderDocuments(new Map([[note.id, 'V']]), {
      documentId: note.id,
      folderId: folder.id,
    });
    await service.setArchived(note.id, true);
    // Editar el contenido no pierde el orden ni el archivado.
    const opened = await service.openNote(note.id);
    const saved = await service.saveNote(opened.session, 'cuerpo nuevo');
    expect(saved.document).toMatchObject({ folderId: folder.id, sortKey: 'V', archived: true });
    expect(saved.revision.metadata).toMatchObject({ sortKey: 'V', archived: true });
    // Renombrar tampoco; desarchivar quita la marca sin escribir `archived: false`.
    await service.renameDocument(note.id, 'Plan B');
    const back = await service.setArchived(note.id, false);
    expect(back.document.archived).toBeUndefined();
    expect('archived' in back.revision.metadata).toBe(false);
    expect(back.revision.metadata.sortKey).toBe('V');
  });

  it('una carpeta se puede mover dentro de otra, pero no dentro de sí misma', async () => {
    const { service } = await fresh();
    const a = await service.createFolder('A');
    const b = await service.createFolder('B', a.id);
    await expect(service.moveDocument(a.id, b.id)).rejects.toThrow();
    const c = await service.createFolder('C');
    expect((await service.moveDocument(c.id, a.id)).document.folderId).toBe(a.id);
  });

  it('el formato abierto conserva el orden y el archivado', async () => {
    const { repo, service } = await fresh();
    const note = await service.createDocument('note', 'Plan');
    await service.reorderDocuments(new Map([[note.id, 'k']]));
    await service.setArchived(note.id, true);
    const files = vaultToFiles(await repo.exportContent(), { deviceId: crypto.randomUUID() });
    const { content } = await filesToVault(files);
    expect(content.documents.find((d) => d.id === note.id)).toMatchObject({
      sortKey: 'k',
      archived: true,
    });
  });
});
