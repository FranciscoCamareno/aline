import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { CanvasExtensions } from '../../domain/sidecar.ts';
import { formatLinkFragment, parseInternalLink } from '../../domain/links.ts';

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
 * - elementLinks: enlaces internos (`aline://`) de los elementos vivos. El sidecar es la copia
 *   autoritativa que leen los índices y otras herramientas; `element.link` es la interacción.
 * - danglingConnectorIds (RN-07): flechas que perdieron un extremo porque su nodo se borró. El
 *   motor ya conserva la flecha (fase 0); aquí solo se marca. Deja de estar suelta al volver a
 *   anclarse o al borrarse.
 * - mindMap (plan 9.22–9.23): se olvidan los nodos, ramas plegadas, ocultos y contadores de
 *   elementos que ya no están en la escena. Un elemento borrado sigue en la escena del motor
 *   mientras dura la sesión (deshacer puede devolverlo), así que su relación se conserva.
 * - noteEmbeds (plan 9.24): se olvidan las tarjetas cuyo rectángulo ya no está en la escena; lo
 *   que no tenga la forma de una tarjeta se conserva tal cual.
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
    if (!target) continue;
    const fragment = formatLinkFragment({
      blockId: target.blockId,
      eventId: target.eventId,
      text: target.text,
    });
    elementLinks[el.id] = {
      documentId: target.documentId,
      elementId: target.elementId,
      ...(fragment ? { fragment } : {}),
    };
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

  const present = new Set(elements.map((e) => e.id));
  const keep = <T>(record: Readonly<Record<string, T>> | undefined) =>
    record && Object.fromEntries(Object.entries(record).filter(([id]) => present.has(id)));
  const mm = previous.mindMap;
  const parentByNode = Object.fromEntries(
    Object.entries(mm.parentByNode).filter(
      ([child, parent]) => present.has(child) && present.has(parent),
    ),
  );
  const hidden = keep(mm.hidden);
  const badges = keep(mm.badges);
  const mindMap: CanvasExtensions['mindMap'] = {
    parentByNode,
    collapsedNodeIds: mm.collapsedNodeIds.filter((id) => present.has(id)),
    ...(hidden && Object.keys(hidden).length ? { hidden } : {}),
    ...(badges && Object.keys(badges).length ? { badges } : {}),
  };

  const noteEmbeds = previous.noteEmbeds.filter((embed) => {
    const id = (embed as { elementId?: unknown } | null)?.elementId;
    return typeof id !== 'string' || present.has(id);
  });

  return {
    ...previous,
    elementLinks,
    mindMap,
    noteEmbeds,
    danglingConnectorIds: [...dangling].sort(),
  };
}
