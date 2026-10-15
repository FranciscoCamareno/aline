import { CaptureUpdateAction, getCommonBounds } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import { excalidrawCanvasAdapter } from '../../adapters/excalidraw/sceneCodec.ts';
import type { VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { cloneElements, selectionWithBound } from './cloneElements.ts';

/**
 * Plantillas del lienzo (sustituyen a la biblioteca de Excalidraw, que no admite imágenes y no
 * se guardaba). Una plantilla es un documento `template` del almacén: una escena .excalidraw con
 * los elementos elegidos y sus imágenes como assets. Se inserta con la API pública del motor.
 */

/** Tipo del arrastre de una plantilla desde el panel hasta el lienzo. */
export const TEMPLATE_DRAG_TYPE = 'application/x-aline-template';

/** ¿Hay algo seleccionado que guardar? */
export function hasSelection(api: ExcalidrawImperativeAPI): boolean {
  const selected = api.getAppState().selectedElementIds;
  return api.getSceneElements().some((e) => selected[e.id]);
}

/** Guarda la selección actual como plantilla. Devuelve el documento creado, o null si no hay nada. */
export async function saveSelectionAsTemplate(
  api: ExcalidrawImperativeAPI,
  service: VaultService,
  title: string,
): Promise<DocumentRecord | null> {
  const elements = selectionWithBound(
    api.getSceneElementsIncludingDeleted(),
    api.getAppState().selectedElementIds,
  );
  if (elements.length === 0) return null;
  const all = api.getFiles();
  const files: BinaryFiles = {};
  for (const element of elements) {
    if (element.type === 'image' && element.fileId && all[element.fileId]) {
      files[element.fileId] = all[element.fileId]!;
    }
  }
  const canvas = await excalidrawCanvasAdapter.serialize({ elements, appState: {}, files });
  return service.createTemplate({ title, canvas });
}

/**
 * Inserta una plantilla centrada en `center` (coordenadas de la escena) o en el centro de la
 * vista. Cada inserción es una copia con identidades nuevas; queda seleccionada y se deshace con
 * la pila normal del motor.
 */
export async function insertTemplate(
  api: ExcalidrawImperativeAPI,
  service: VaultService,
  templateId: string,
  center?: { x: number; y: number },
): Promise<void> {
  const opened = await service.openTemplate(templateId);
  const scene = await excalidrawCanvasAdapter.deserialize(opened.sceneJson, (hash) =>
    service.loadAsset(hash),
  );
  const source = scene.elements.filter((e) => !e.isDeleted);
  if (source.length === 0) return;
  const appState = api.getAppState();
  const zoom = appState.zoom.value;
  const target = center ?? {
    x: appState.width / 2 / zoom - appState.scrollX,
    y: appState.height / 2 / zoom - appState.scrollY,
  };
  const [x1, y1, x2, y2] = getCommonBounds(source);
  const copies = cloneElements(source, {
    x: Math.round(target.x - (x1 + x2) / 2),
    y: Math.round(target.y - (y1 + y2) / 2),
  });
  const files = Object.values(scene.files) as BinaryFileData[];
  if (files.length) api.addFiles(files);
  const selectedElementIds: Record<string, true> = {};
  const selectedGroupIds: Record<string, true> = {};
  for (const element of copies) {
    selectedElementIds[element.id] = true;
    for (const group of element.groupIds) selectedGroupIds[group] = true;
  }
  api.setActiveTool({ type: 'selection' });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...(copies as ExcalidrawElement[])],
    appState: { selectedElementIds, selectedGroupIds },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
