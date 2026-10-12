import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

/**
 * Prototipo de proyección de ramas colapsadas (diseño §9.1). No es código de producto:
 * sirve para medir si la API pública permite ocultar descendientes sin borrarlos.
 *
 * Estrategia probada: los elementos ocultos salen de la escena del motor y se guardan aquí,
 * intactos; la actualización usa CaptureUpdateAction.NEVER para no entrar en el deshacer.
 */
export class BranchProjection {
  readonly hidden = new Map<string, ExcalidrawElement>();
  private readonly api: ExcalidrawImperativeAPI;

  constructor(api: ExcalidrawImperativeAPI) {
    this.api = api;
  }

  /** Descendientes del árbol mental (sidecar parentByNode), sin incluir la raíz. */
  static descendants(rootId: string, parentByNode: Record<string, string>): Set<string> {
    const result = new Set<string>();
    let frontier = [rootId];
    while (frontier.length) {
      const next: string[] = [];
      for (const [child, parent] of Object.entries(parentByNode)) {
        if (frontier.includes(parent) && !result.has(child)) {
          result.add(child);
          next.push(child);
        }
      }
      frontier = next;
    }
    return result;
  }

  collapse(rootId: string, parentByNode: Record<string, string>): string[] {
    const nodes = BranchProjection.descendants(rootId, parentByNode);
    const elements = this.api.getSceneElementsIncludingDeleted();
    const hide = BranchProjection.closure(elements, nodes);
    for (const el of elements) if (hide.has(el.id)) this.hidden.set(el.id, el);
    this.api.updateScene({
      elements: elements.filter((el) => !hide.has(el.id)),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    return [...hide];
  }

  /** Elementos que colapsar la rama dejaría ocultos (nodos, sus textos y conectores). */
  static closure(elements: readonly ExcalidrawElement[], nodes: Set<string>): Set<string> {
    const hide = new Set<string>(nodes);
    for (const el of elements) {
      if ('containerId' in el && el.containerId && nodes.has(el.containerId)) hide.add(el.id);
      if (el.type === 'arrow') {
        const s = el.startBinding?.elementId;
        const e = el.endBinding?.elementId;
        if ((s && nodes.has(s)) || (e && nodes.has(e))) hide.add(el.id);
      }
    }
    return hide;
  }

  expand(): void {
    const current = this.api.getSceneElementsIncludingDeleted();
    const currentIds = new Set(current.map((el) => el.id));
    const restored = [...this.hidden.values()].filter((el) => !currentIds.has(el.id));
    this.hidden.clear();
    this.api.updateScene({
      elements: [...current, ...restored],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
}

/**
 * Alternativa: los elementos ocultos siguen en la escena con opacidad 0 y bloqueados.
 * El historial del motor nunca ve que desaparezcan, y los conectores ocultos siguen a sus
 * extremos. Los valores originales se guardan aquí (en el producto irían al sidecar).
 * La exportación visible debe filtrar los ocultos con `isHidden`.
 */
export class OpacityProjection {
  readonly original = new Map<string, { opacity: number; locked: boolean }>();
  private readonly api: ExcalidrawImperativeAPI;

  constructor(api: ExcalidrawImperativeAPI) {
    this.api = api;
  }

  isHidden(id: string): boolean {
    return this.original.has(id);
  }

  collapse(rootId: string, parentByNode: Record<string, string>): string[] {
    const elements = this.api.getSceneElementsIncludingDeleted();
    const hide = BranchProjection.closure(
      elements,
      BranchProjection.descendants(rootId, parentByNode),
    );
    this.api.updateScene({
      elements: elements.map((el) => {
        if (!hide.has(el.id) || this.original.has(el.id)) return el;
        this.original.set(el.id, { opacity: el.opacity, locked: el.locked });
        return newElementWith(el, { opacity: 0, locked: true });
      }),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    return [...hide];
  }

  expand(): void {
    const elements = this.api.getSceneElementsIncludingDeleted();
    this.api.updateScene({
      elements: elements.map((el) => {
        const prev = this.original.get(el.id);
        return prev ? newElementWith(el, prev) : el;
      }),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    this.original.clear();
  }
}
