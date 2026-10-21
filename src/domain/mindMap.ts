/**
 * Árbol del mapa mental de un lienzo (diseño §9.1, plan 9.22–9.23), sin motor: el sidecar guarda
 * `parentByNode` (hijo → padre, un padre como mucho y sin ciclos) y las ramas plegadas. Las
 * flechas visuales no son el árbol: una conexión conceptual entre ramas no participa en plegar.
 *
 * Plegar sigue la estrategia B de la fase 0 (`docs/fase-0-viabilidad.md` §3.6): los ocultos se
 * quedan en la escena con opacidad 0 y bloqueados, nunca se sacan de ella (eso rompía deshacer).
 * Aquí solo se calcula QUÉ se oculta; el adaptador del lienzo lo aplica.
 */

/** Lo que se usa de un elemento del lienzo (forma, texto o flecha). */
export interface MindElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ParentByNode = Readonly<Record<string, string>>;

/** Hijos directos de un nodo, en el orden en que se crearon (el de `parentByNode`). */
export function childrenOf(parentByNode: ParentByNode, nodeId: string): string[] {
  return Object.entries(parentByNode)
    .filter(([, parent]) => parent === nodeId)
    .map(([child]) => child);
}

/** Todos los descendientes de un nodo (sin él), en anchura. Resiste un sidecar con ciclos. */
export function descendantsOf(parentByNode: ParentByNode, nodeId: string): string[] {
  const out: string[] = [];
  const seen = new Set([nodeId]);
  const queue = [nodeId];
  while (queue.length) {
    for (const child of childrenOf(parentByNode, queue.shift()!)) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/** ¿Hacer a `child` hijo de `parent` crearía un ciclo (o un nodo hijo de sí mismo)? */
export function wouldCreateCycle(
  parentByNode: ParentByNode,
  child: string,
  parent: string,
): boolean {
  return child === parent || descendantsOf(parentByNode, child).includes(parent);
}

/** Separación horizontal entre un nodo y sus hijos, y vertical entre hermanos. */
export const CHILD_GAP_X = 80;
export const CHILD_GAP_Y = 24;

/**
 * Dónde va un hijo nuevo: a la derecha del padre; el primero, centrado con él, y los siguientes
 * debajo del hermano más bajo.
 */
export function childPosition(
  parent: Pick<MindElement, 'x' | 'y' | 'width' | 'height'>,
  siblings: ReadonlyArray<Pick<MindElement, 'x' | 'y' | 'width' | 'height'>>,
  size: { width: number; height: number },
): { x: number; y: number } {
  const x = parent.x + parent.width + CHILD_GAP_X;
  if (!siblings.length) return { x, y: parent.y + (parent.height - size.height) / 2 };
  const bottom = Math.max(...siblings.map((s) => s.y + s.height));
  return { x, y: bottom + CHILD_GAP_Y };
}

/**
 * Elementos que oculta plegar un nodo: sus descendientes, sus textos, las flechas que tocan algún
 * nodo oculto y las etiquetas de esas flechas. El propio nodo sigue visible.
 */
export function collapseSet(
  elements: readonly MindElement[],
  parentByNode: ParentByNode,
  rootId: string,
): Set<string> {
  const nodes = new Set(descendantsOf(parentByNode, rootId));
  const hidden = new Set(nodes);
  for (const el of elements) {
    if (el.containerId && nodes.has(el.containerId)) hidden.add(el.id);
    const start = el.startBinding?.elementId;
    const end = el.endBinding?.elementId;
    if (el.type === 'arrow' && ((start && nodes.has(start)) || (end && nodes.has(end)))) {
      hidden.add(el.id);
    }
  }
  // Etiquetas de las flechas ocultas.
  for (const el of elements) if (el.containerId && hidden.has(el.containerId)) hidden.add(el.id);
  return hidden;
}

/**
 * Proyección visible: todo lo que debe estar oculto ahora, la unión de las ramas plegadas cuyo
 * nodo sigue vivo. Así plegados anidados funcionan solos: desplegar el abuelo no muestra lo que
 * oculta un hijo que sigue plegado.
 */
export function hiddenProjection(
  elements: readonly MindElement[],
  parentByNode: ParentByNode,
  collapsedNodeIds: readonly string[],
): Set<string> {
  const live = new Set(elements.filter((e) => !e.isDeleted).map((e) => e.id));
  const hidden = new Set<string>();
  for (const root of collapsedNodeIds) {
    if (!live.has(root)) continue;
    for (const id of collapseSet(elements, parentByNode, root)) hidden.add(id);
  }
  return hidden;
}

/** Ramas plegadas que ocultan `elementId` (para desplegarlas al llegar a él por un enlace). */
export function collapsedAncestorsHiding(
  elements: readonly MindElement[],
  parentByNode: ParentByNode,
  collapsedNodeIds: readonly string[],
  elementId: string,
): string[] {
  return collapsedNodeIds.filter((root) =>
    collapseSet(elements, parentByNode, root).has(elementId),
  );
}
