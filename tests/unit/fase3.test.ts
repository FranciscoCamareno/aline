import { describe, expect, it } from 'vitest';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieKnowledgeStore } from '../../src/adapters/indexeddb/DexieKnowledgeStore.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { currentBindings, deriveExtensions } from '../../src/adapters/excalidraw/sidecar.ts';
import {
  extractCanvas,
  extractNote,
  internalLink,
  parseInternalLink,
} from '../../src/application/knowledge.ts';
import { KnowledgeService } from '../../src/application/KnowledgeService.ts';
import { normalizeForSearch, SearchIndex } from '../../src/application/searchIndex.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { effectiveFolder, RECOVERY_FOLDER, wouldCreateCycle } from '../../src/domain/folders.ts';
import { parseNoteMarkdown } from '../../src/domain/frontmatter.ts';
import { emptyCanvasExtensions } from '../../src/domain/sidecar.ts';
import type { SearchDocument } from '../../src/ports/KnowledgeStore.ts';
import { utf8Decode } from '../../src/shared/hash.ts';

async function openVault() {
  const db = new VaultDatabase(`fase3-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  const service = new VaultService(repo);
  const knowledge = new KnowledgeService(repo, new DexieKnowledgeStore(db));
  return { db, repo, service, knowledge };
}

async function note(service: VaultService, title: string, body: string) {
  const doc = await service.createDocument('note', title);
  await service.saveNote((await service.openNote(doc.id)).session, body);
  return doc;
}

describe('carpetas y etiquetas (RF-25, RN-08, CA-21)', () => {
  it('crea carpetas anidadas, mueve documentos y evita ciclos', async () => {
    const { service } = await openVault();
    const ideas = await service.createFolder('Ideas');
    const sub = await service.createFolder('Arquitectura', ideas.id);
    const doc = await service.createDocument('note', 'Nota');
    const moved = await service.moveDocument(doc.id, sub.id);
    expect(moved.document.folderId).toBe(sub.id);
    await expect(service.moveDocument(ideas.id, sub.id)).rejects.toMatchObject({
      code: 'invalid-title',
    });
    await expect(service.moveDocument(doc.id, doc.id)).rejects.toMatchObject({ code: 'not-found' });
    expect(wouldCreateCycle(await service.listDocuments(), ideas.id, sub.id)).toBe(true);
    await service.moveDocument(doc.id, null);
    expect((await service.listDocuments()).find((d) => d.id === doc.id)?.folderId).toBeNull();
  });

  it('borrar una carpeta no borra su contenido: pasa a recuperación (sin cascada)', async () => {
    const { service } = await openVault();
    const folder = await service.createFolder('Temporal');
    const doc = await service.createDocument('note', 'Dentro');
    await service.moveDocument(doc.id, folder.id);
    await service.trashDocument(folder.id);
    const docs = await service.listDocuments();
    const inside = docs.find((d) => d.id === doc.id)!;
    expect(inside.deleted).toBe(false);
    const folders = new Map(docs.filter((d) => d.kind === 'folder').map((d) => [d.id, d]));
    expect(effectiveFolder(inside, folders)).toBe(RECOVERY_FOLDER);
  });

  it('las etiquetas no distinguen mayúsculas y viajan en el frontmatter', async () => {
    const { repo, service } = await openVault();
    const doc = await note(service, 'Con etiquetas', 'cuerpo');
    const result = await service.setTags(doc.id, ['Idea', 'idea ', 'Sistema', '']);
    expect(result.document.tags).toEqual(['Idea', 'Sistema']);
    const blob = await repo.getBlob(result.revision.contentRefs.body!);
    const parsed = parseNoteMarkdown(utf8Decode(blob!.bytes));
    expect(parsed.frontmatter?.tags).toEqual(['Idea', 'Sistema']);
    expect(parsed.body).toBe('cuerpo');
  });
});

describe('extracción de enlaces y texto (§10)', () => {
  const target = '8b53f815-9d38-4313-a1ad-cb690fabf23c';

  it('reconoce enlaces internos y [[Título]] fuera del código', () => {
    const body = `Ver [el mapa](${internalLink(target, 'nodo 1')}) y [[Ideas]].\n\n\`[[no]]\`\n\n\`\`\`\n[[tampoco]]\n\`\`\`\n[web](https://example.com)`;
    const { links, text } = extractNote(body);
    expect(links).toEqual([
      {
        sourceElementId: null,
        targetDocumentId: target,
        targetElementId: 'nodo 1',
        kind: 'markdown',
        label: 'el mapa',
      },
      {
        sourceElementId: null,
        targetDocumentId: null,
        targetElementId: null,
        kind: 'wiki',
        label: 'Ideas',
      },
    ]);
    expect(text).toContain('tampoco'); // el código sí se indexa para buscar
    expect(parseInternalLink('mindnote://document/no-uuid')).toBeNull();
  });

  it('agrupa el texto de un lienzo por la forma que lo contiene', () => {
    const scene = JSON.stringify({
      elements: [
        { id: 'R', type: 'rectangle', link: internalLink(target) },
        { id: 'T1', type: 'text', text: 'Raíz del mapa', containerId: 'R' },
        { id: 'T2', type: 'text', text: 'texto suelto' },
        { id: 'X', type: 'text', text: 'borrado', isDeleted: true },
      ],
    });
    const out = extractCanvas(scene, null);
    expect(out.elements).toEqual([
      { elementId: 'R', text: 'Raíz del mapa' },
      { elementId: 'T2', text: 'texto suelto' },
    ]);
    expect(out.links).toEqual([
      {
        sourceElementId: 'R',
        targetDocumentId: target,
        targetElementId: null,
        kind: 'element',
        label: 'Raíz del mapa',
      },
    ]);
  });
});

describe('sidecar del lienzo (RN-07 y enlaces de elementos)', () => {
  const el = (props: Record<string, unknown>) =>
    ({ isDeleted: false, link: null, ...props }) as unknown as ExcalidrawElement;
  const target = '8b53f815-9d38-4313-a1ad-cb690fabf23c';

  it('deriva enlaces internos y marca conectores que pierden un extremo al borrar un nodo', () => {
    const A = el({ id: 'A', type: 'rectangle', link: internalLink(target) });
    const B = el({ id: 'B', type: 'rectangle' });
    const F = el({
      id: 'F',
      type: 'arrow',
      startBinding: { elementId: 'A' },
      endBinding: { elementId: 'B' },
    });
    const base = emptyCanvasExtensions(target);
    const first = deriveExtensions(base, [A, B, F], new Map());
    expect(first.elementLinks).toEqual({ A: { documentId: target, elementId: null } });
    expect(first.danglingConnectorIds).toEqual([]);

    // El motor desancla la flecha al borrar B (fase 0, prueba 0.5).
    const afterDelete = [
      A,
      el({ id: 'B', type: 'rectangle', isDeleted: true }),
      el({ id: 'F', type: 'arrow', startBinding: { elementId: 'A' }, endBinding: null }),
    ];
    const second = deriveExtensions(first, afterDelete, currentBindings([A, B, F]));
    expect(second.danglingConnectorIds).toEqual(['F']);

    // Al volver a anclarla, deja de estar suelta.
    const third = deriveExtensions(second, [A, B, F], currentBindings(afterDelete));
    expect(third.danglingConnectorIds).toEqual([]);
    // Una flecha que nunca estuvo anclada no se marca.
    const free = el({ id: 'G', type: 'arrow', startBinding: null, endBinding: null });
    expect(deriveExtensions(base, [free], new Map()).danglingConnectorIds).toEqual([]);
  });

  it('el lienzo guarda el sidecar derivado y los índices lo leen', async () => {
    const { service, knowledge } = await openVault();
    const destino = await note(service, 'Destino', 'texto');
    const canvas = await service.createDocument('canvas', 'Mapa');
    const opened = await service.openCanvas(canvas.id);
    const extensions = {
      ...opened.extensions,
      elementLinks: { R: { documentId: destino.id, elementId: null } },
    };
    await service.saveCanvas(opened.session, {
      sceneJson: JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [{ id: 'R', type: 'rectangle' }],
      }),
      assets: [],
      extensions,
    });
    expect((await service.openCanvas(canvas.id)).extensions.elementLinks).toEqual(
      extensions.elementLinks,
    );
    await knowledge.sync();
    const back = await knowledge.backlinks(destino.id);
    expect(back.map((b) => [b.source?.id, b.link.sourceElementId])).toEqual([[canvas.id, 'R']]);
  });
});

describe('backlinks, renombrado y enlaces rotos (CA-06, CA-07, CA-08)', () => {
  it('muestra backlinks, los conserva al renombrar y lista los rotos', async () => {
    const { service, knowledge } = await openVault();
    const a = await note(service, 'Ideas de arquitectura', 'destino');
    await note(service, 'Duplicada', 'uno');
    await note(service, 'Duplicada', 'dos');
    const gone = await note(service, 'Se borrará', 'x');
    const src = await note(
      service,
      'Origen',
      `[A](${internalLink(a.id)}) [[ideas de arquitectura]] [[Duplicada]] [[No existe]] [B](${internalLink(gone.id)})`,
    );
    await service.trashDocument(gone.id);
    await knowledge.sync();

    const back = await knowledge.backlinks(a.id);
    expect(back.map((b) => b.link.kind).sort()).toEqual(['markdown', 'wiki']);

    await service.renameDocument(a.id, 'Arquitectura (renombrada)');
    await knowledge.sync();
    // El enlace por UUID sigue funcionando sin reescribir nada; el [[Título]] antiguo ya no resuelve.
    const after = await knowledge.backlinks(a.id);
    expect(after.map((b) => b.link.kind)).toEqual(['markdown']);
    expect(after[0]!.source?.id).toBe(src.id);

    const broken = await knowledge.brokenLinks();
    expect(broken.map((b) => `${b.status}:${b.link.label}`).sort()).toEqual([
      'ambiguous:Duplicada',
      'trashed:B',
      'unresolved:No existe',
      'unresolved:ideas de arquitectura',
    ]);
  });

  it('sincronizar solo vuelve a indexar lo que cambió y retira lo que ya no está activo', async () => {
    const { service, knowledge } = await openVault();
    const a = await note(service, 'A', 'uno');
    const b = await note(service, 'B', 'dos');
    expect((await knowledge.sync()).changed.length).toBeGreaterThanOrEqual(2);
    expect((await knowledge.sync()).changed).toEqual([]);
    await service.saveNote((await service.openNote(a.id)).session, 'uno cambiado');
    expect((await knowledge.sync()).changed.map((d) => d.documentId)).toEqual([a.id]);
    await service.trashDocument(b.id);
    expect((await knowledge.sync()).removed).toEqual([b.id]);
  });
});

describe('búsqueda (RF-26, CA-09, RNF-10)', () => {
  const doc = (
    id: string,
    title: string,
    text: string,
    elements: SearchDocument['elements'] = [],
  ): SearchDocument => ({
    documentId: id,
    revisionId: id,
    kind: elements.length ? 'canvas' : 'note',
    title,
    tags: [],
    text,
    elements,
  });

  it('ignora mayúsculas y acentos, busca por prefijo y localiza el elemento del lienzo', () => {
    const index = new SearchIndex();
    index.replaceAll([
      doc('n1', 'Arquitectura', 'La canción del árbol'),
      doc('c1', 'Mapa', 'Raíz Árbol de decisión', [
        { elementId: 'r', text: 'Raíz' },
        { elementId: 'a', text: 'Árbol de decisión' },
      ]),
    ]);
    expect(normalizeForSearch('Árbol Canción')).toBe('arbol cancion');
    const hits = index.search('arbol');
    expect(hits.map((h) => h.documentId).sort()).toEqual(['c1', 'n1']);
    expect(hits.find((h) => h.documentId === 'c1')?.elementIds).toEqual(['a']);
    expect(index.search('cancio')[0]?.documentId).toBe('n1');
    expect(index.search('arquitectrua')[0]?.documentId).toBe('n1'); // tolerancia a errores
    expect(index.search('cancion')[0]?.snippet).toContain('canción');
    index.remove(['n1']);
    expect(index.search('cancion')).toEqual([]);
  });

  it('referencia: 2 000 notas y 500 lienzos, consulta por debajo de 1 s (medido en Node)', () => {
    const words =
      'idea mapa nodo sistema arquitectura proceso cliente datos riesgo plan objetivo equipo'.split(
        ' ',
      );
    const sentence = (i: number) =>
      Array.from({ length: 150 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(' ') +
      ` único${i}`;
    const docs: SearchDocument[] = [];
    for (let i = 0; i < 2000; i++) docs.push(doc(`n${i}`, `Nota ${i}`, sentence(i)));
    for (let i = 0; i < 500; i++) {
      const elements = Array.from({ length: 100 }, (_, k) => ({
        elementId: `e${k}`,
        text: `${words[(i + k) % words.length]} ${k}`,
      }));
      docs.push(doc(`c${i}`, `Lienzo ${i}`, elements.map((e) => e.text).join(' '), elements));
    }
    const index = new SearchIndex();
    const t0 = performance.now();
    index.replaceAll(docs);
    const buildMs = performance.now() - t0;
    const queries = ['arquitectura', 'único1999', 'riesg', 'plan objetivo', 'sistema nodo'];
    const times = queries.map((q) => {
      const t = performance.now();
      index.search(q);
      return performance.now() - t;
    });
    console.log(
      `[benchmark] indexar=${buildMs.toFixed(0)} ms, consultas=${times.map((t) => t.toFixed(0)).join('/')} ms`,
    );
    expect(index.search('único1999')[0]?.documentId).toBe('n1999');
    expect(Math.max(...times)).toBeLessThan(1000);
  });
});

describe('avisos de cambio para los índices', () => {
  it('toda orden que crea una revisión avisa a los oyentes (los documentos nuevos se indexan)', async () => {
    const { service } = await openVault();
    const seen: string[] = [];
    service.onCommit((r) => seen.push(r.revision.operation + ':' + r.document.kind));
    const folder = await service.createFolder('F');
    const doc = await service.createDocument('note', 'Nueva');
    await service.saveNote((await service.openNote(doc.id)).session, 'texto');
    await service.renameDocument(doc.id, 'Otra');
    await service.setTags(doc.id, ['x']);
    await service.moveDocument(doc.id, folder.id);
    await service.trashDocument(doc.id);
    await service.restoreFromTrash(doc.id);
    expect(seen).toEqual([
      'save:folder',
      'save:note',
      'save:note',
      'save:note',
      'save:note',
      'save:note',
      'delete:note',
      'restore:note',
    ]);
  });
});
