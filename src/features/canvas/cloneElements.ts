import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

/**
 * Copia de un grupo de elementos con identidades nuevas (para insertar una plantilla varias
 * veces). Se renuevan los ids, los grupos y todas las referencias internas: texto ligado a su
 * contenedor, flechas unidas a sus extremos y elementos dentro de un marco. Las referencias a
 * elementos que no están en el grupo se sueltan; los archivos (`fileId`) se conservan, porque el
 * mismo contenido es el mismo archivo. Sin dependencias del motor: se prueba aparte.
 */
type Element = ExcalidrawElement & {
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
};

export function cloneElements(
  elements: readonly ExcalidrawElement[],
  offset: { x: number; y: number },
  newId: () => string = () => crypto.randomUUID(),
): ExcalidrawElement[] {
  const ids = new Map(elements.map((e) => [e.id, newId()]));
  const groups = new Map<string, string>();
  const group = (id: string) => {
    let next = groups.get(id);
    if (!next) groups.set(id, (next = newId()));
    return next;
  };
  const rebind = <T extends { elementId: string } | null | undefined>(binding: T): T | null =>
    binding && ids.has(binding.elementId)
      ? ({ ...binding, elementId: ids.get(binding.elementId)! } as T)
      : null;

  return (elements as readonly Element[]).map((element) => {
    const copy: Record<string, unknown> = {
      ...element,
      id: ids.get(element.id)!,
      x: element.x + offset.x,
      y: element.y + offset.y,
      groupIds: element.groupIds.map(group),
      frameId: element.frameId && ids.has(element.frameId) ? ids.get(element.frameId) : null,
      boundElements:
        element.boundElements
          ?.filter((b) => ids.has(b.id))
          .map((b) => ({ ...b, id: ids.get(b.id)! })) ?? null,
      // El motor recalcula el orden al insertarlos (índices fraccionarios nuevos).
      index: null,
      updated: Date.now(),
    };
    if ('containerId' in element) {
      copy['containerId'] =
        element.containerId && ids.has(element.containerId) ? ids.get(element.containerId) : null;
    }
    if ('startBinding' in element) copy['startBinding'] = rebind(element.startBinding);
    if ('endBinding' in element) copy['endBinding'] = rebind(element.endBinding);
    return copy as unknown as ExcalidrawElement;
  });
}

/** Elementos que forman la selección: los elegidos más sus textos ligados y sus contenedores. */
export function selectionWithBound(
  elements: readonly ExcalidrawElement[],
  selectedIds: Readonly<Record<string, boolean>>,
): ExcalidrawElement[] {
  const live = (elements as readonly Element[]).filter((e) => !e.isDeleted);
  const chosen = new Set(live.filter((e) => selectedIds[e.id]).map((e) => e.id));
  for (const e of live) {
    if (e.containerId && chosen.has(e.containerId)) chosen.add(e.id);
    if (chosen.has(e.id) && e.containerId) chosen.add(e.containerId);
  }
  // Mismo orden que en la escena: el de capas.
  return live.filter((e) => chosen.has(e.id));
}
