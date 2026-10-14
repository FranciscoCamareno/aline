import { CaptureUpdateAction, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, FileId } from '@excalidraw/excalidraw/element/types';
import type { DataURL, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { sha256Hex } from '../../shared/hash.ts';

/**
 * Stickers de la marca en el lienzo (DESIGN.md, «Selector de stickers»). En el selector se
 * muestran los SVG; en el lienzo se insertan los PNG de 512 px, porque el motor contrarresta su
 * filtro del tema oscuro en las imágenes de mapa de bits pero no en las SVG: un SVG saldría
 * invertido en oscuro. Se guardan como cualquier imagen (blob direccionado por su SHA-256).
 */
const svgs = import.meta.glob<string>('../../../brand/stickers/sticker-*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const pngs = import.meta.glob<string>('../../../brand/stickers/sticker-*-512.png', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** Primero los personajes y después los acentos. */
export const STICKER_NAMES = [
  'a',
  'nube',
  'corazon',
  'nota',
  'lapiz',
  'estallido',
  'rayo',
  'chispas',
  'bocadillo',
  'exclamacion',
  'flecha',
  'garabato',
  'corona',
] as const;
export type StickerName = (typeof STICKER_NAMES)[number];

const urlFor = (files: Record<string, string>, suffix: string) => (name: StickerName) =>
  Object.entries(files).find(([path]) => path.endsWith(`/sticker-${name}${suffix}`))?.[1] ?? '';
export const stickerPreviewUrl = urlFor(svgs, '.svg');
const stickerImageUrl = urlFor(pngs, '-512.png');

/** Tamaño en el lienzo y giro máximo de colocación (los archivos van rectos). */
export const STICKER_SIZE = 120;
const MAX_TILT = (10 * Math.PI) / 180;

/** Tipo del arrastre desde el selector hasta el lienzo. */
export const STICKER_DRAG_TYPE = 'application/x-aline-sticker';

async function loadSticker(name: StickerName): Promise<{ id: FileId; dataURL: DataURL }> {
  const bytes = new Uint8Array(await (await fetch(stickerImageUrl(name))).arrayBuffer());
  const hash = await sha256Hex(bytes);
  const dataURL = await new Promise<DataURL>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as DataURL);
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el sticker'));
    reader.readAsDataURL(new Blob([bytes], { type: 'image/png' }));
  });
  // Mismo contenido, mismo id: el mismo sticker repetido comparte el archivo.
  return { id: hash as FileId, dataURL };
}

/**
 * Coloca un sticker centrado en `center` (coordenadas de la escena) o, sin él, en el centro de
 * la vista. Queda seleccionado; se deshace con la pila normal del motor.
 */
export async function insertSticker(
  api: ExcalidrawImperativeAPI,
  name: StickerName,
  center?: { x: number; y: number },
): Promise<void> {
  const file = await loadSticker(name);
  const appState = api.getAppState();
  const zoom = appState.zoom.value;
  const at = center ?? {
    x: appState.width / 2 / zoom - appState.scrollX,
    y: appState.height / 2 / zoom - appState.scrollY,
  };
  api.addFiles([
    { id: file.id, dataURL: file.dataURL, mimeType: 'image/png', created: Date.now() },
  ]);
  const id = crypto.randomUUID();
  const [element] = restoreElements(
    [
      {
        id,
        type: 'image',
        x: Math.round(at.x - STICKER_SIZE / 2),
        y: Math.round(at.y - STICKER_SIZE / 2),
        width: STICKER_SIZE,
        height: STICKER_SIZE,
        angle: (Math.random() * 2 - 1) * MAX_TILT,
        fileId: file.id,
        status: 'saved',
        scale: [1, 1],
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        roundness: null,
        groupIds: [],
        locked: false,
        link: null,
      } as unknown as ExcalidrawElement,
    ],
    null,
    { refreshDimensions: false, repairBindings: false },
  );
  api.setActiveTool({ type: 'selection' });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element!],
    appState: { selectedElementIds: { [id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
