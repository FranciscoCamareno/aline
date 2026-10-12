import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { CanvasExtensions } from '../../domain/sidecar.ts';
import { parseInternalLink } from '../../application/knowledge.ts';

/** Extremos anclados de cada flecha en el último guardado. */
export type ArrowBindings = Map<string, { start: string | null; end: string | null }>;

function bindingsOf(el: ExcalidrawElement): { start: string | null; end: string | null } | null {
  if (el.type !== 'arrow') return null;
  return {
    start: el.startBinding?.elementId ?? null,
    end: el.endBinding?.elementId ?? null,
  };
}

export function currentBindings(elements: readonly ExcalidrawElement[]): ArrowBindings {
  const map: ArrowBindings = new Map();
  for (const el of elements) {
    const b = !el.isDeleted ? bindingsOf(el) : null;
    if (b) map.set(el.id, b);
  }
  return map;
}

/**
 * Deriva el sidecar a partir de la escena (diseño §9):
 * - elementLinks: enlaces internos `mindnote://` de los elementos vivos. El sidecar es la copia
 *   autoritativa que leen los índices y otras herramientas; `element.link` es la interacción.
 * - danglingConnectorIds (RN-07): flechas que perdieron un extremo porque su nodo se borró. El
 *   motor ya conserva la flecha (fase 0); aquí solo se marca. Deja de estar suelta al volver a
 *   anclarse o al borrarse.
 * Las ramas (mindMap) y las tarjetas (noteEmbeds) se conservan tal cual.
 */
export function deriveExtensions(
  previous: CanvasExtensions,
  elements: readonly ExcalidrawElement[],
  previousBindings: ArrowBindings,
): CanvasExtensions {
  const live = new Map(elements.filter((e) => !e.isDeleted).map((e) => [e.id, e]));

  const elementLinks: CanvasExtensions['elementLinks'] = {};
  for (const el of [...live.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const target = el.link ? parseInternalLink(el.link) : null;
    if (target)
      elementLinks[el.id] = { documentId: target.documentId, elementId: target.elementId };
  }

  const dangling = new Set<string>();
  for (const id of previous.danglingConnectorIds) {
    const b = live.get(id) ? bindingsOf(live.get(id)!) : null;
    if (b && (!b.start || !b.end)) dangling.add(id);
  }
  for (const [id, before] of previousBindings) {
    const el = live.get(id);
    const now = el ? bindingsOf(el) : null;
    if (!now) continue;
    const lostStart = before.start && !now.start && !live.has(before.start);
    const lostEnd = before.end && !now.end && !live.has(before.end);
    if (lostStart || lostEnd) dangling.add(id);
  }

  return {
    ...previous,
    elementLinks,
    danglingConnectorIds: [...dangling].sort(),
  };
}
