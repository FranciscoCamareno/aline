import { hashElementsVersion, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFileData, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { CanvasAdapter, CanvasAsset, SerializedCanvas } from '../../ports/CanvasAdapter.ts';
import { base64ToBytes, bytesToBase64 } from '../../shared/base64.ts';
import { sha256Hex } from '../../shared/hash.ts';

/** Preferencias del motor que no forman parte del contenido; se aplican al abrir. */
const ENGINE_DEFAULTS: Partial<AppState> = { currentItemStrokeColor: '#262118' };

/** Escena tal como la entrega el motor en onChange. */
export interface EngineScene {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

/**
 * Prefijo con el que se sustituye el dataURL de cada archivo dentro de la escena guardada.
 * La exportación .excalidraw autocontenida (pendiente) debe volver a incrustar los bytes.
 */
export const ASSET_REF_PREFIX = 'mindnote-asset:';

interface SceneFile {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  [key: string]: unknown;
}

function dataUrlToBytes(dataURL: string): { mimeType: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataURL);
  if (!match) throw new Error('dataURL no válido');
  const [, mimeType = 'application/octet-stream', base64, payload = ''] = match;
  if (!base64) return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
  return { mimeType, bytes: base64ToBytes(payload) };
}

function bytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

/**
 * El motor muestra el HTML de `customData.generationData` de un elemento `iframe` (función de
 * generación con IA que esta aplicación no usa) en un marco con scripts. Ese HTML vendría de la
 * escena guardada, así que nunca se entrega al motor; el elemento queda como marco vacío.
 */
function withoutGeneratedHtml(element: ExcalidrawElement): ExcalidrawElement {
  const customData = element.customData as Record<string, unknown> | undefined;
  if (element.type !== 'iframe' || !customData || !('generationData' in customData)) {
    return element;
  }
  const rest = { ...customData };
  delete rest['generationData'];
  return { ...element, customData: rest };
}

/**
 * Adaptador Excalidraw (diseño §9): serializa con las utilidades de la versión fijada,
 * separa imágenes como assets direccionados por SHA-256 y las rehidrata al cargar.
 */
export const excalidrawCanvasAdapter: CanvasAdapter<EngineScene> = {
  async serialize(scene) {
    const data = JSON.parse(
      serializeAsJSON(scene.elements, scene.appState, scene.files, 'local'),
    ) as { files?: Record<string, SceneFile> };
    const assets: CanvasAsset[] = [];
    for (const file of Object.values(data.files ?? {})) {
      if (file.dataURL.startsWith(ASSET_REF_PREFIX)) continue;
      const { mimeType, bytes } = dataUrlToBytes(file.dataURL);
      const hash = await sha256Hex(bytes);
      assets.push({ hash, mimeType, bytes });
      file.dataURL = `${ASSET_REF_PREFIX}${hash}`;
    }
    const result: SerializedCanvas = { sceneJson: JSON.stringify(data), assets };
    return result;
  },

  async deserialize(sceneJson, loadAsset) {
    const data = JSON.parse(sceneJson) as {
      elements?: ExcalidrawElement[];
      appState?: Partial<AppState>;
      files?: Record<string, SceneFile>;
    };
    const files: BinaryFiles = {};
    for (const [id, file] of Object.entries(data.files ?? {})) {
      let { dataURL } = file;
      if (typeof dataURL !== 'string') continue;
      if (dataURL.startsWith(ASSET_REF_PREFIX)) {
        const asset = await loadAsset(dataURL.slice(ASSET_REF_PREFIX.length));
        // Un asset ausente no se inventa: el motor mostrará la imagen como no disponible.
        if (!asset) continue;
        dataURL = bytesToDataUrl(asset.mimeType, asset.bytes);
      } else if (!dataURL.startsWith('data:')) {
        // Misma regla que al importar (RF-34): una URL remota haría una petición al mostrarla.
        // Vale para toda escena, también la recibida al sincronizar o restaurar (auditoría H02).
        continue;
      }
      files[id] = { ...file, dataURL } as unknown as BinaryFileData;
    }
    const restored = restore(
      {
        elements: (data.elements ?? []).map(withoutGeneratedHtml),
        appState: data.appState ?? {},
        files,
      },
      // Valores de herramienta que la escena no guarda: el trazo empieza en tinta (DESIGN.md §3.2).
      ENGINE_DEFAULTS,
      null,
    );
    return { elements: restored.elements, appState: restored.appState, files: restored.files };
  },

  contentSignature(scene) {
    // Desplazamiento, zoom y selección no cambian esta firma (diseño §7.1, paso 1).
    const fileIds = Object.keys(scene.files).sort().join(',');
    return `${hashElementsVersion(scene.elements)}|${scene.appState.viewBackgroundColor ?? ''}|${fileIds}`;
  },
};
