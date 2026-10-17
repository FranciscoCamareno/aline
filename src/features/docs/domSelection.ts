/**
 * Selección vigente en el DOM de un editor ProseMirror, en posiciones del documento.
 *
 * ProseMirror lee la selección del navegador en el evento `selectionchange`, que llega después de
 * la tecla que la movió. Si un atajo (Ctrl/⌘+K, Ctrl/⌘+Mayús+K) se pulsa justo después de
 * Mayús+flecha, su `keydown` llega antes que ese evento y `state.selection` aún es la anterior:
 * el enlace se aplicaría a un trozo más corto. Las acciones sobre la selección la leen de aquí
 * y, si difiere, la sincronizan antes de usarla. Sirve para Tiptap y Milkdown, que traen copias
 * distintas de ProseMirror, porque solo usa lo común a las dos.
 */
interface ViewLike {
  dom: Element;
  root: Document | ShadowRoot;
  posAtDOM(node: Node, offset: number, bias?: number): number;
}

/** `null` si el DOM no tiene una selección dentro del editor o no se puede traducir. */
export function domSelectionRange(view: ViewLike): { from: number; to: number } | null {
  const root = view.root as Document & { getSelection?: () => Selection | null };
  const selection = root.getSelection?.() ?? document.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return null;
  if (!view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) {
    return null;
  }
  try {
    const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
    const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
    return { from: Math.min(anchor, head), to: Math.max(anchor, head) };
  } catch {
    return null; // Nodo fuera del contenido editable (p. ej. una vista de nodo propia).
  }
}
