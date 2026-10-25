import { describe, expect, it } from 'vitest';
import { DexieKnowledgeStore } from '../../src/adapters/indexeddb/DexieKnowledgeStore.ts';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { canvasLinkTargets, elementBounds } from '../../src/application/canvasTargets.ts';
import { KnowledgeService } from '../../src/application/KnowledgeService.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { internalLink } from '../../src/domain/links.ts';
import { emptyCanvasExtensions } from '../../src/domain/sidecar.ts';

const DOC = '5f0c7a8e-3d1b-4a52-9c1e-2b7d9e4f6a10';

const base = { isDeleted: false, angle: 0, groupIds: [], width: 10, height: 10 };
const scene = (elements: Record<string, unknown>[]) =>
  JSON.stringify({
    type: 'excalidraw',
    version: 2,
    elements: elements.map((e) => ({ ...base, ...e })),
  });

describe('elementos de un lienzo que se pueden enlazar (plan 10.6)', () => {
  it('la forma lleva el texto que contiene; el texto ligado no sale aparte', () => {
    const targets = canvasLinkTargets(
      scene([
        { id: 'r', type: 'rectangle', x: 0, y: 100, width: 80, height: 40 },
        { id: 't', type: 'text', x: 5, y: 105, text: 'Idea central', containerId: 'r' },
        { id: 'libre', type: 'text', x: 0, y: 0, text: 'Título' },
      ]),
      emptyCanvasExtensions(DOC),
    );
    expect(targets).toEqual([
      {
        elementId: 'libre',
        kind: 'text',
        label: 'Título',
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
      {
        elementId: 'r',
        kind: 'shape',
        label: 'Idea central',
        bounds: { x: 0, y: 100, width: 80, height: 40 },
      },
    ]);
  });

  it('un grupo es un destino (el miembro con texto); marcos por nombre; conectores sin etiqueta fuera', () => {
    const targets = canvasLinkTargets(
      scene([
        { id: 'cuerpo', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, groupIds: ['g'] },
        { id: 'area', type: 'rectangle', x: 10, y: 20, width: 80, height: 70, groupIds: ['g'] },
        {
          id: 'texto',
          type: 'text',
          x: 12,
          y: 22,
          text: 'Comprar pan',
          containerId: 'area',
          groupIds: ['g'],
        },
        { id: 'marco', type: 'frame', x: 0, y: 200, width: 300, height: 200, name: 'Fase 1' },
        {
          id: 'flecha',
          type: 'arrow',
          x: 0,
          y: 150,
          points: [
            [0, 0],
            [50, 10],
          ],
        },
        { id: 'borrado', type: 'ellipse', x: 0, y: 500, isDeleted: true },
        { id: 'web', type: 'embeddable', x: 0, y: 600 },
      ]),
      emptyCanvasExtensions(DOC),
    );
    expect(targets.map((t) => [t.elementId, t.kind, t.label])).toEqual([
      ['area', 'shape', 'Comprar pan'],
      ['marco', 'frame', 'Fase 1'],
    ]);
    expect(targets[0]!.bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('no ofrece lo oculto por una rama plegada ni el contador «+N»', () => {
    const extensions = emptyCanvasExtensions(DOC);
    extensions.mindMap = {
      parentByNode: { hijo: 'padre' },
      collapsedNodeIds: ['padre'],
      hidden: { hijo: { opacity: 100, locked: false } },
      badges: { padre: 'contador' },
    };
    const targets = canvasLinkTargets(
      scene([
        { id: 'padre', type: 'ellipse', x: 0, y: 0 },
        { id: 'hijo', type: 'ellipse', x: 50, y: 0, opacity: 0, locked: true },
        { id: 'contador', type: 'text', x: 20, y: 0, text: '+1' },
      ]),
      extensions,
    );
    expect(targets.map((t) => t.elementId)).toEqual(['padre']);
  });

  it('la caja de un elemento girado contiene sus esquinas; la de una línea, sus puntos', () => {
    const turned = elementBounds({ x: 0, y: 0, width: 100, height: 20, angle: Math.PI / 2 });
    expect(turned.width).toBeCloseTo(20);
    expect(turned.height).toBeCloseTo(100);
    expect(turned.x).toBeCloseTo(40);
    expect(turned.y).toBeCloseTo(-40);
    expect(
      elementBounds({
        x: 10,
        y: 10,
        points: [
          [0, 0],
          [-5, 30],
          [20, 5],
        ],
      }),
    ).toEqual({
      x: 5,
      y: 10,
      width: 25,
      height: 30,
    });
  });

  it('una escena ilegible no ofrece nada', () => {
    expect(canvasLinkTargets('{no es json', null)).toEqual([]);
  });
});

describe('enlace a un elemento borrado (plan 10.6)', () => {
  it('el índice marca el ancla como perdida cuando el elemento ya no está', async () => {
    const db = new VaultDatabase(`enlaces-lienzo-${crypto.randomUUID()}`);
    const repo = new DexieVaultRepository(db);
    await repo.init();
    const service = new VaultService(repo);
    const knowledge = new KnowledgeService(repo, new DexieKnowledgeStore(db));

    const canvas = await service.createDocument('canvas', 'Mapa');
    const saveScene = async (elements: Record<string, unknown>[]) => {
      const opened = await service.openCanvas(canvas.id);
      await service.saveCanvas(opened.session, {
        sceneJson: scene(elements),
        assets: [],
        extensions: opened.extensions,
      });
      await knowledge.reindex(canvas.id);
    };
    await saveScene([{ id: 'caja', type: 'rectangle', x: 0, y: 0 }]);

    const source = await service.createDocument('note', 'Notas');
    const note = await service.openNote(source.id);
    await service.saveNote(
      note.session,
      `[la caja](${internalLink(canvas.id, { elementId: 'caja' })})`,
    );
    await knowledge.reindex(source.id);
    expect((await knowledge.outgoing(source.id)).map((r) => r.status)).toEqual(['ok']);

    await saveScene([{ id: 'otra', type: 'rectangle', x: 0, y: 0 }]);
    expect((await knowledge.outgoing(source.id)).map((r) => r.status)).toEqual(['anchor-lost']);
    expect((await knowledge.brokenLinks()).map((r) => r.link.label)).toEqual(['la caja']);
  });
});
