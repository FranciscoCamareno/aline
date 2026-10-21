import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { describe, expect, it } from 'vitest';
import { deriveExtensions } from '../../src/adapters/excalidraw/sidecar.ts';
import {
  childPosition,
  childrenOf,
  collapsedAncestorsHiding,
  collapseSet,
  descendantsOf,
  hiddenProjection,
  wouldCreateCycle,
  type MindElement,
} from '../../src/domain/mindMap.ts';
import { emptyCanvasExtensions } from '../../src/domain/sidecar.ts';

const box = (id: string, extra: Partial<MindElement> = {}): MindElement => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  ...extra,
});
const arrow = (id: string, from: string, to: string): MindElement =>
  box(id, { type: 'arrow', startBinding: { elementId: from }, endBinding: { elementId: to } });
const text = (id: string, container: string): MindElement =>
  box(id, { type: 'text', containerId: container });

// R → C1 → G1 y R → C2, con sus textos y flechas; X es una conexión conceptual C2 → G1.
const tree = { C1: 'R', C2: 'R', G1: 'C1' };
const scene: MindElement[] = [
  box('R'),
  box('C1'),
  box('C2'),
  box('G1'),
  text('tR', 'R'),
  text('tC1', 'C1'),
  text('tG1', 'G1'),
  arrow('aRC1', 'R', 'C1'),
  arrow('aRC2', 'R', 'C2'),
  arrow('aC1G1', 'C1', 'G1'),
  arrow('X', 'C2', 'G1'),
  text('tX', 'X'),
];

describe('árbol del mapa mental (diseño §9.1, plan 9.22–9.23)', () => {
  it('hijos, descendientes y ciclos', () => {
    expect(childrenOf(tree, 'R')).toEqual(['C1', 'C2']);
    expect(descendantsOf(tree, 'R')).toEqual(['C1', 'C2', 'G1']);
    expect(descendantsOf({ A: 'B', B: 'A' }, 'A')).toEqual(['B']); // un sidecar con ciclo no cuelga
    expect(wouldCreateCycle(tree, 'R', 'G1')).toBe(true);
    expect(wouldCreateCycle(tree, 'C2', 'G1')).toBe(false);
  });

  it('el primer hijo va centrado a la derecha; los siguientes, debajo del último', () => {
    const parent = { x: 0, y: 100, width: 120, height: 60 };
    const size = { width: 120, height: 60 };
    expect(childPosition(parent, [], size)).toEqual({ x: 200, y: 100 });
    expect(childPosition(parent, [{ x: 200, y: 100, width: 120, height: 60 }], size)).toEqual({
      x: 200,
      y: 184,
    });
  });

  it('plegar oculta descendientes, sus textos y las flechas que los tocan, no el propio nodo', () => {
    const hidden = collapseSet(scene, tree, 'C1');
    expect([...hidden].sort()).toEqual(['G1', 'X', 'aC1G1', 'tG1', 'tX']);
    // La conexión conceptual X se oculta porque su extremo G1 está oculto.
    expect(collapseSet(scene, tree, 'R').has('R')).toBe(false);
  });

  it('plegados anidados: desplegar el abuelo no muestra lo que oculta un hijo plegado', () => {
    const both = hiddenProjection(scene, tree, ['R', 'C1']);
    expect(both.has('C1') && both.has('G1')).toBe(true);
    const onlyChild = hiddenProjection(scene, tree, ['C1']);
    expect(onlyChild.has('C1')).toBe(false);
    expect(onlyChild.has('G1')).toBe(true);
    // Un nodo plegado borrado no oculta nada.
    expect(
      hiddenProjection([...scene.slice(1), box('R', { isDeleted: true })], tree, ['R']).size,
    ).toBe(0);
    expect(collapsedAncestorsHiding(scene, tree, ['R', 'C1'], 'G1')).toEqual(['R', 'C1']);
  });

  it('el sidecar olvida lo que ya no está en la escena, pero no lo borrado de la sesión', () => {
    const base = emptyCanvasExtensions(crypto.randomUUID());
    const previous = {
      ...base,
      mindMap: {
        parentByNode: { C1: 'R', Z: 'R' },
        collapsedNodeIds: ['R', 'Q'],
        hidden: { C1: { opacity: 100, locked: false }, Q: { opacity: 80, locked: false } },
        badges: { R: 'b1', Q: 'b2' },
      },
    };
    const elements = [
      box('R'),
      box('C1', { isDeleted: true }),
      box('b1', { type: 'text' }),
    ] as unknown as ExcalidrawElement[];
    const next = deriveExtensions(previous, elements, new Map());
    expect(next.mindMap).toEqual({
      parentByNode: { C1: 'R' },
      collapsedNodeIds: ['R'],
      hidden: { C1: { opacity: 100, locked: false } },
      badges: { R: 'b1' },
    });
  });
});
