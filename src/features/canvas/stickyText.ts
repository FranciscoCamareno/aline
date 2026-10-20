import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { isStickyTextArea } from './stickyNote.ts';

/**
 * Texto de las notas adhesivas arriba a la izquierda (DESIGN.md §3.5, plan 9.13). El motor crea
 * el texto de una forma centrado; al aparecer un texto nuevo ligado al área de texto de una nota,
 * se alinea arriba a la izquierda una sola vez (después, el usuario puede cambiarlo). Los textos
 * que ya estaban al abrir el lienzo no se tocan. Devuelve la función que deja de escuchar.
 */
export function watchStickyText(api: ExcalidrawImperativeAPI): () => void {
  const seen = new Set<string>();
  let primed = false;
  return api.onChange((elements) => {
    const isText = (e: ExcalidrawElement) => e.type === 'text' && !e.isDeleted;
    if (!primed) {
      for (const e of elements) if (isText(e)) seen.add(e.id);
      primed = elements.length > 0;
      return;
    }
    const byId = new Map(elements.map((e) => [e.id, e]));
    const fix = new Set<string>();
    for (const e of elements) {
      if (!isText(e) || seen.has(e.id) || e.type !== 'text' || !e.containerId) continue;
      seen.add(e.id);
      const container = byId.get(e.containerId);
      if (container && isStickyTextArea(container)) {
        if (e.verticalAlign !== 'top' || e.textAlign !== 'left') fix.add(e.id);
      }
    }
    if (!fix.size) return;
    // Fuera del onChange en curso: el motor no admite cambiar la escena mientras avisa.
    queueMicrotask(() =>
      api.updateScene({
        elements: api
          .getSceneElementsIncludingDeleted()
          .map((e) =>
            fix.has(e.id) && e.type === 'text'
              ? newElementWith(e, { verticalAlign: 'top', textAlign: 'left' })
              : e,
          ),
        captureUpdate: CaptureUpdateAction.NEVER,
      }),
    );
  });
}
