import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw';
import type { ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

/**
 * `[[` en el lienzo (plan 9.5): al escribirlo en el editor de texto del motor se quitan los dos
 * corchetes y se abre el selector; el destino elegido va al `element.link` del texto (o de su
 * contenedor). Si el texto queda vacío, el motor lo borra al cerrar su editor: entonces se crea
 * un texto nuevo con el título enlazado, en el mismo sitio y con el mismo estilo.
 */
export interface CanvasWikiTarget {
  elementId: string;
  /** Texto que se estaba editando, para recrearlo si el motor lo borró por vacío. */
  text: ExcalidrawTextElement;
}

/**
 * Escucha la escritura en el editor de texto del motor (`textarea.excalidraw-wysiwyg`, solo con
 * su API pública y eventos del DOM). Devuelve la función que deja de escuchar.
 */
export function watchCanvasWikiLinks(
  api: ExcalidrawImperativeAPI,
  onTrigger: (target: CanvasWikiTarget) => void,
): () => void {
  const onInput = (event: Event) => {
    const area = event.target;
    if (!(area instanceof HTMLTextAreaElement) || !area.classList.contains('excalidraw-wysiwyg')) {
      return;
    }
    // Solo la tecla escrita: el evento que se reenvía abajo no es un InputEvent.
    if (!(event instanceof InputEvent) || event.data !== '[') return;
    const caret = area.selectionStart;
    if (area.selectionEnd !== caret || area.value.slice(caret - 2, caret) !== '[[') return;
    const editing = api.getAppState().editingTextElement;
    if (editing?.type !== 'text') return;
    area.value = area.value.slice(0, caret - 2) + area.value.slice(caret);
    area.setSelectionRange(caret - 2, caret - 2);
    // El motor lee el texto en su `oninput`.
    area.dispatchEvent(new Event('input', { bubbles: true }));
    // Cerrar ya el editor: al cerrarse, el motor devuelve el foco a su contenedor, y si eso
    // ocurriera con el selector abierto le quitaría el foco a su búsqueda.
    area.blur();
    onTrigger({ elementId: editing.containerId ?? editing.id, text: editing });
  };
  document.addEventListener('input', onInput, true);
  return () => document.removeEventListener('input', onInput, true);
}

/** Enlaza el elemento de `target`, o crea un texto con el título si el motor lo borró. */
export function applyCanvasWikiLink(
  api: ExcalidrawImperativeAPI,
  target: CanvasWikiTarget,
  pick: { url: string; title: string },
): void {
  const elements = api.getSceneElementsIncludingDeleted();
  const existing = elements.find((e) => e.id === target.elementId && !e.isDeleted);
  if (existing) {
    api.updateScene({
      elements: elements.map((e) => (e === existing ? newElementWith(e, { link: pick.url }) : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    return;
  }
  const { text } = target;
  const [created] = convertToExcalidrawElements([
    {
      type: 'text',
      x: text.x,
      y: text.y,
      text: pick.title,
      fontFamily: text.fontFamily,
      fontSize: text.fontSize,
      strokeColor: text.strokeColor,
      opacity: text.opacity,
      link: pick.url,
    },
  ]);
  if (!created) return;
  api.updateScene({
    elements: [...elements, created],
    appState: { selectedElementIds: { [created.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
