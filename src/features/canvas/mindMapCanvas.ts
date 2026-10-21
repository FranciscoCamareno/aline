import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  childPosition,
  childrenOf,
  collapsedAncestorsHiding,
  descendantsOf,
  hiddenProjection,
  type MindElement,
} from '../../domain/mindMap.ts';
import type { CanvasExtensions } from '../../domain/sidecar.ts';

/**
 * Mapa mental en el lienzo (diseño §9.1, plan 9.22–9.23), solo con la API pública del motor.
 * El árbol vive en el sidecar (`mindMap`); aquí se crean hijos y se aplica la proyección de las
 * ramas plegadas (estrategia B de la fase 0: opacidad 0 y bloqueados, nunca fuera de la escena).
 */
export type MindMapState = CanvasExtensions['mindMap'];

/** Formas que pueden ser nodos del mapa (las que admiten texto dentro). */
const NODE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);

export const isMindNode = (element: ExcalidrawElement | undefined | null): boolean =>
  !!element && !element.isDeleted && NODE_TYPES.has(element.type);

const asMind = (elements: readonly ExcalidrawElement[]) =>
  elements as unknown as readonly MindElement[];

/** Descendientes vivos de un nodo (para el botón de plegar y su contador). */
export function liveDescendants(
  api: ExcalidrawImperativeAPI,
  mindMap: MindMapState,
  nodeId: string,
): string[] {
  const live = new Set(api.getSceneElements().map((e) => e.id));
  return descendantsOf(mindMap.parentByNode, nodeId).filter((id) => live.has(id));
}

/**
 * Crea un hijo conectado del nodo `parentId` (RF-14): una forma igual que el padre a su derecha,
 * una flecha anclada a los dos, y el hijo seleccionado. Es un solo cambio de escena, así que un
 * solo «deshacer» lo quita entero (diseño §9.1: «como un comando único»). Devuelve el árbol con
 * la relación nueva y el id del hijo.
 */
export function createChild(
  api: ExcalidrawImperativeAPI,
  mindMap: MindMapState,
  parentId: string,
): { mindMap: MindMapState; childId: string } | null {
  const elements = api.getSceneElementsIncludingDeleted();
  const parent = elements.find((e) => e.id === parentId);
  if (!parent || !isMindNode(parent)) return null;
  const live = new Map(elements.filter((e) => !e.isDeleted).map((e) => [e.id, e]));
  const siblings = childrenOf(mindMap.parentByNode, parentId)
    .map((id) => live.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const size = { width: parent.width, height: parent.height };
  const at = childPosition(parent, siblings, size);
  const [child] = convertToExcalidrawElements([
    {
      type: parent.type as 'rectangle' | 'ellipse' | 'diamond',
      x: at.x,
      y: at.y,
      width: size.width,
      height: size.height,
      strokeColor: parent.strokeColor,
      backgroundColor: parent.backgroundColor,
      fillStyle: parent.fillStyle,
      strokeWidth: parent.strokeWidth,
      strokeStyle: parent.strokeStyle,
      roughness: parent.roughness,
      opacity: parent.opacity,
      ...(parent.roundness ? { roundness: parent.roundness } : {}),
    },
  ]);
  if (!child) return null;
  // Flecha del borde derecho del padre al izquierdo del hijo; el motor la recoloca al moverlos.
  const from = { x: parent.x + parent.width, y: parent.y + parent.height / 2 };
  const to = { x: child.x, y: child.y + child.height / 2 };
  const [arrowDraft] = convertToExcalidrawElements([
    {
      type: 'arrow',
      x: from.x,
      y: from.y,
      width: to.x - from.x,
      height: to.y - from.y,
      points: [
        [0, 0],
        [to.x - from.x, to.y - from.y],
      ],
      strokeColor: parent.strokeColor,
      strokeWidth: parent.strokeWidth,
      roughness: parent.roughness,
    },
  ]);
  if (!arrowDraft) return null;
  const arrow = newElementWith(arrowDraft, {
    startBinding: { elementId: parent.id, focus: 0, gap: 4 },
    endBinding: { elementId: child.id, focus: 0, gap: 4 },
  } as Partial<typeof arrowDraft>);
  const bound = (e: ExcalidrawElement) =>
    newElementWith(e, {
      boundElements: [...(e.boundElements ?? []), { id: arrow.id, type: 'arrow' as const }],
    });
  api.updateScene({
    elements: [...elements.map((e) => (e.id === parent.id ? bound(e) : e)), bound(child), arrow],
    appState: { selectedElementIds: { [child.id]: true }, selectedGroupIds: {} },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return {
    mindMap: { ...mindMap, parentByNode: { ...mindMap.parentByNode, [child.id]: parent.id } },
    childId: child.id,
  };
}

/** Empieza a escribir en el nodo seleccionado: lo mismo que pulsar Intro en el motor. */
export function startEditingSelected(host: HTMLElement): void {
  host
    .querySelector('.excalidraw')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

const BADGE_FONT = 16;

/**
 * Aplica la proyección de las ramas plegadas (diseño §9.1): oculta (opacidad 0, bloqueado) lo que
 * debe estar oculto guardando sus valores originales, restaura lo que ya no, y mantiene el
 * contador «+N» de cada nodo plegado junto a él. Es idempotente: si no hay nada que cambiar no
 * toca la escena. También vuelve a ocultar lo que el usuario desbloquee con el menú del motor.
 * Los cambios no entran en el historial de deshacer (como en la prueba 0.6 de la fase 0).
 */
export function applyProjection(
  api: ExcalidrawImperativeAPI,
  mindMap: MindMapState,
): MindMapState | null {
  const elements = api.getSceneElementsIncludingDeleted();
  const hiddenNow = { ...(mindMap.hidden ?? {}) };
  const badgesNow = { ...(mindMap.badges ?? {}) };
  const byId = new Map(elements.map((e) => [e.id, e]));
  const isBadge = new Set(Object.values(badgesNow));
  const shouldHide = hiddenProjection(
    asMind(elements.filter((e) => !isBadge.has(e.id))),
    mindMap.parentByNode,
    mindMap.collapsedNodeIds,
  );
  /** Cambios por elemento (opacidad, bloqueo, posición o texto del contador, borrado). */
  const patches = new Map<string, Record<string, unknown>>();
  for (const id of shouldHide) {
    const el = byId.get(id);
    if (!el || el.isDeleted) continue;
    if (!hiddenNow[id]) hiddenNow[id] = { opacity: el.opacity, locked: el.locked };
    if (el.opacity !== 0 || !el.locked) patches.set(id, { opacity: 0, locked: true });
  }
  for (const [id, original] of Object.entries(hiddenNow)) {
    if (shouldHide.has(id)) continue;
    delete hiddenNow[id];
    const el = byId.get(id);
    if (el && !el.isDeleted)
      patches.set(id, { opacity: original.opacity, locked: original.locked });
  }

  // Contadores: uno por nodo plegado visible, bajo su esquina derecha.
  const extra: ExcalidrawElement[] = [];
  const liveRoots = mindMap.collapsedNodeIds.filter((id) => {
    const el = byId.get(id);
    return el && !el.isDeleted && !shouldHide.has(id);
  });
  for (const [root, badgeId] of Object.entries(badgesNow)) {
    if (liveRoots.includes(root)) continue;
    delete badgesNow[root];
    const badge = byId.get(badgeId);
    if (badge && !badge.isDeleted) patches.set(badgeId, { isDeleted: true });
  }
  for (const root of liveRoots) {
    const node = byId.get(root)!;
    const count = descendantsOf(mindMap.parentByNode, root).filter((id) => {
      const el = byId.get(id);
      return el && !el.isDeleted;
    }).length;
    const text = `+${count}`;
    const x = node.x + node.width + 6;
    const y = node.y + node.height - BADGE_FONT;
    const badge = badgesNow[root] ? byId.get(badgesNow[root]) : undefined;
    if (badge && !badge.isDeleted && badge.type === 'text') {
      const moved = Math.abs(badge.x - x) > 0.5 || Math.abs(badge.y - y) > 0.5;
      if (moved || badge.text !== text) {
        patches.set(badge.id, { x, y, text, originalText: text });
      }
      continue;
    }
    const [created] = convertToExcalidrawElements([
      {
        type: 'text',
        x,
        y,
        text,
        fontSize: BADGE_FONT,
        strokeColor: node.strokeColor === 'transparent' ? '#262118' : node.strokeColor,
        locked: true,
      },
    ]);
    if (created) {
      extra.push(created);
      badgesNow[root] = created.id;
    }
  }

  if (!patches.size && !extra.length) return null;
  api.updateScene({
    elements: [
      ...elements.map((e) => {
        const patch = patches.get(e.id);
        return patch ? newElementWith(e, patch as Parameters<typeof newElementWith>[1]) : e;
      }),
      ...extra,
    ],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  const next: MindMapState = {
    parentByNode: mindMap.parentByNode,
    collapsedNodeIds: mindMap.collapsedNodeIds,
  };
  if (Object.keys(hiddenNow).length) next.hidden = hiddenNow;
  if (Object.keys(badgesNow).length) next.badges = badgesNow;
  return next;
}

/** Pliega o despliega la rama de `nodeId` y aplica la proyección (RF-15). */
export function toggleCollapse(
  api: ExcalidrawImperativeAPI,
  mindMap: MindMapState,
  nodeId: string,
): MindMapState {
  const collapsed = mindMap.collapsedNodeIds.includes(nodeId);
  const next: MindMapState = {
    ...mindMap,
    collapsedNodeIds: collapsed
      ? mindMap.collapsedNodeIds.filter((id) => id !== nodeId)
      : [...mindMap.collapsedNodeIds, nodeId],
  };
  return applyProjection(api, next) ?? next;
}

/** Despliega las ramas que ocultan un elemento (al llegar a él por un enlace o la búsqueda). */
export function revealElement(
  api: ExcalidrawImperativeAPI,
  mindMap: MindMapState,
  elementId: string,
): MindMapState | null {
  const hiding = collapsedAncestorsHiding(
    asMind(api.getSceneElementsIncludingDeleted()),
    mindMap.parentByNode,
    mindMap.collapsedNodeIds,
    elementId,
  );
  if (!hiding.length) return null;
  const next = {
    ...mindMap,
    collapsedNodeIds: mindMap.collapsedNodeIds.filter((id) => !hiding.includes(id)),
  };
  return applyProjection(api, next) ?? next;
}

/** Ids que no deben exportarse: lo oculto por las ramas plegadas. */
export function hiddenIds(mindMap: MindMapState | undefined): ReadonlySet<string> {
  return new Set(Object.keys(mindMap?.hidden ?? {}));
}
