import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { DexieKnowledgeStore } from '../../src/adapters/indexeddb/DexieKnowledgeStore.ts';
import { KnowledgeService } from '../../src/application/KnowledgeService.ts';
import { filesToVault, vaultToFiles } from '../../src/application/vaultFormat.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { isContentKind } from '../../src/domain/revision.ts';
import { parseRichDoc, richDocText, type RichDocData } from '../../src/domain/richDoc.ts';

async function freshService() {
  const db = new VaultDatabase(`doc-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  return { db, repo, service: new VaultService(repo) };
}

/** Árbol como el que produce Tiptap: título centrado, párrafo con negrita y una lista. */
const sample: RichDocData['content'] = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1, textAlign: 'center' },
      content: [{ type: 'text', text: 'Guion' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Escena ' },
        { type: 'text', text: 'uno', marks: [{ type: 'bold' }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
        },
      ],
    },
  ],
};

describe('modelo del documento de texto enriquecido', () => {
  it('acepta el árbol del editor y conserva las claves desconocidas', () => {
    const parsed = parseRichDoc({ schemaVersion: 1, content: sample, futuro: { x: 1 } });
    expect(parsed.readOnly).toBeNull();
    expect((parsed.doc as Record<string, unknown>)['futuro']).toEqual({ x: 1 });
  });

  it('una versión posterior o un contenido inválido se abren en solo lectura', () => {
    expect(parseRichDoc({ schemaVersion: 2, content: sample }).readOnly).toBe(
      'unsupported-version',
    );
    expect(parseRichDoc({ schemaVersion: 1, content: { type: 'p' } }).readOnly).toBe(
      'invalid-content',
    );
    expect(parseRichDoc(null).readOnly).toBe('invalid-content');
  });

  it('extrae el texto plano, un bloque por línea', () => {
    expect(richDocText({ schemaVersion: 1, content: sample })).toBe('Guion\nEscena uno\na\nb');
  });
});

describe('documentos en el almacén (cambio de arquitectura 15/10/2026)', () => {
  it('crea, abre y guarda un documento como revisiones inmutables', async () => {
    const { service } = await freshService();
    const doc = await service.createRichDoc('Guion');
    expect(doc.kind).toBe('doc');
    expect(doc.folderId).toBeNull();
    expect(isContentKind(doc.kind)).toBe(false);

    const opened = await service.openRichDoc(doc.id);
    expect(opened.readOnly).toBeNull();
    const saved = await service.saveRichDoc(opened.session, sample, opened.doc);
    // Guardar lo mismo no crea otra revisión.
    const same = await service.saveRichDoc(opened.session, sample, opened.doc);
    expect(same.revision.id).toBe(saved.revision.id);

    const reopened = await service.openRichDoc(doc.id);
    expect(reopened.doc.content).toEqual(sample);
    expect(await service.listHistory(doc.id)).toHaveLength(2);

    const preview = await service.previewRevision(saved.revision.id);
    expect(preview.kind).toBe('doc');

    // Un árbol sin raíz `doc` no llega a guardarse.
    await expect(
      service.saveRichDoc(reopened.session, { type: 'p' } as unknown as RichDocData['content']),
    ).rejects.toThrow();
  });

  it('el formato abierto lo guarda en .json y lo recupera', async () => {
    const { service } = await freshService();
    const doc = await service.createRichDoc('Notas de rodaje');
    const opened = await service.openRichDoc(doc.id);
    await service.saveRichDoc(opened.session, sample, opened.doc);

    const content = await service.exportContent();
    const files = vaultToFiles(content, { deviceId: crypto.randomUUID() });
    const head = content.revisions.find(
      (r) => r.id === content.documents.find((d) => d.id === doc.id)!.headRevisionIds[0],
    )!;
    expect(files.has(`objects/${head.contentRefs.body}.json`)).toBe(true);
    // Sin copia legible: solo las notas Markdown la tienen.
    expect([...files.keys()].some((p) => p.startsWith(`readable/${doc.id}/`))).toBe(false);

    const { content: back, problems } = await filesToVault(files);
    expect(problems).toEqual([]);
    expect(back.documents.find((d) => d.id === doc.id)?.kind).toBe('doc');
  });

  it('duplicar en un conflicto crea otro documento de texto', async () => {
    const { db, service } = await freshService();
    const doc = await service.createRichDoc('Compartido');
    const [base] = doc.headRevisionIds;
    const other = new VaultService(new DexieVaultRepository(new VaultDatabase(db.name)));
    const opened = await other.openRichDoc(doc.id);
    await other.saveRichDoc(opened.session, sample, opened.doc);
    await service.saveRichDoc(
      { documentId: doc.id, knownHeads: [base!], readOnly: null },
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Del iPad' }] }],
      },
    );
    const heads = await service.conflictHeads(doc.id);
    expect(heads).toHaveLength(2);
    const { duplicate } = await service.resolveConflict(doc.id, {
      kind: 'duplicate',
      keepRevisionId: heads[0]!.id,
      copyRevisionId: heads[1]!.id,
      copyTitle: 'Compartido (copia)',
    });
    expect(duplicate?.kind).toBe('doc');
    expect(richDocText((await service.openRichDoc(duplicate!.id)).doc)).toBeTruthy();
  });

  it('el índice de enlaces y búsqueda lo ignora (por ahora)', async () => {
    const { db, repo, service } = await freshService();
    const doc = await service.createRichDoc('Guion');
    const knowledge = new KnowledgeService(repo, new DexieKnowledgeStore(db));
    expect(await knowledge.reindex(doc.id)).toBeNull();
  });
});
