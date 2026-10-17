import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { describe, expect, it } from 'vitest';
import { deriveExtensions } from '../../src/adapters/excalidraw/sidecar.ts';
import { DexieKnowledgeStore } from '../../src/adapters/indexeddb/DexieKnowledgeStore.ts';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { extractCanvas } from '../../src/application/knowledge.ts';
import {
  KNOWLEDGE_INDEX_FORMAT,
  KnowledgeService,
} from '../../src/application/KnowledgeService.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { internalLink } from '../../src/domain/links.ts';
import { emptyCanvasExtensions } from '../../src/domain/sidecar.ts';

const TARGET = '8b53f815-9d38-4313-a1ad-cb690fabf23c';
const quote = { prefix: '', start: 'la escena', end: '', suffix: '' };

async function fresh() {
  const db = new VaultDatabase(`indice-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  const store = new DexieKnowledgeStore(db);
  return {
    db,
    store,
    service: new VaultService(repo),
    knowledge: new KnowledgeService(repo, store),
  };
}

describe('ancla de los enlaces del lienzo en el sidecar (fase 7.E)', () => {
  const el = (props: Record<string, unknown>) =>
    ({ isDeleted: false, link: null, ...props }) as unknown as ExcalidrawElement;

  it('el sidecar guarda el fragmento que no es un elemento y el índice lo lee', () => {
    const link = internalLink(TARGET, { blockId: 'p1', text: quote });
    const sidecar = deriveExtensions(
      emptyCanvasExtensions(TARGET),
      [
        el({ id: 'A', type: 'rectangle', link }),
        el({ id: 'B', type: 'rectangle', link: internalLink(TARGET, { elementId: 'n1' }) }),
      ],
      new Map(),
    );
    expect(sidecar.elementLinks['A']).toEqual({
      documentId: TARGET,
      elementId: null,
      fragment: link.split('#')[1],
    });
    // Un enlace a un elemento no necesita fragmento.
    expect(sidecar.elementLinks['B']).toEqual({ documentId: TARGET, elementId: 'n1' });

    const scene = JSON.stringify({ elements: [{ id: 'A', type: 'rectangle', link }] });
    const [extracted] = extractCanvas(scene, JSON.stringify(sidecar)).links;
    expect(extracted).toMatchObject({ targetBlockId: 'p1', targetQuote: quote });
  });

  it('con un sidecar sin fragmento (versión anterior), el ancla sale del enlace del elemento', () => {
    const link = internalLink(TARGET, { text: quote });
    const sidecar = { ...emptyCanvasExtensions(TARGET) };
    sidecar.elementLinks = { A: { documentId: TARGET, elementId: null } };
    const scene = JSON.stringify({ elements: [{ id: 'A', type: 'rectangle', link }] });
    const [extracted] = extractCanvas(scene, JSON.stringify(sidecar)).links;
    expect(extracted?.targetQuote).toEqual(quote);
  });
});

describe('estado de las anclas en los backlinks y enlaces rotos (fase 7.E)', () => {
  it('cita encontrada, aproximada (sigue el bloque) y perdida', async () => {
    const { service, knowledge } = await fresh();
    const doc = await service.createRichDoc('Guion');
    const opened = await service.openRichDoc(doc.id);
    const paragraph = (text: string) => ({
      type: 'doc' as const,
      content: [{ type: 'paragraph', attrs: { anchor: 'p1' }, content: [{ type: 'text', text }] }],
    });
    await service.saveRichDoc(
      opened.session,
      paragraph('Hoy rodamos la escena del puerto.'),
      opened.doc,
    );

    const source = await service.createDocument('note', 'Notas');
    const note = await service.openNote(source.id);
    await service.saveNote(
      note.session,
      [
        `[escena](${internalLink(doc.id, { blockId: 'p1', text: quote })})`,
        `[solo cita](${internalLink(doc.id, { text: quote })})`,
      ].join('\n\n'),
    );
    await knowledge.reindex(doc.id);
    await knowledge.reindex(source.id);
    expect((await knowledge.outgoing(source.id)).map((r) => r.status)).toEqual(['ok', 'ok']);

    // Cambia la frase: con bloque, aproximado; sin bloque, perdido (y cuenta como roto).
    const reopened = await service.openRichDoc(doc.id);
    await service.saveRichDoc(reopened.session, paragraph('Hoy rodamos otra cosa.'), reopened.doc);
    await knowledge.reindex(doc.id);
    expect((await knowledge.outgoing(source.id)).map((r) => r.status)).toEqual([
      'approximate',
      'anchor-lost',
    ]);
    expect((await knowledge.backlinks(doc.id)).map((r) => r.status)).toEqual([
      'approximate',
      'anchor-lost',
    ]);
    expect((await knowledge.brokenLinks()).map((r) => r.link.label)).toEqual(['solo cita']);
  });

  it('un índice de un formato anterior se reconstruye entero al sincronizar', async () => {
    const { service, knowledge, store } = await fresh();
    const note = await service.createDocument('note', 'Una');
    await knowledge.sync();
    expect(await store.indexFormat()).toBe(KNOWLEDGE_INDEX_FORMAT);
    expect((await knowledge.sync()).changed).toHaveLength(0);

    await store.setIndexFormat(1);
    const { changed } = await knowledge.sync();
    expect(changed.map((d) => d.documentId)).toContain(note.id);
    expect(await store.indexFormat()).toBe(KNOWLEDGE_INDEX_FORMAT);
  });
});
