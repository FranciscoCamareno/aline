import { hashElementsVersion, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFileData, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { CanvasAdapter, CanvasAsset, SerializedCanvas } from '../../ports/CanvasAdapter.ts';
import { base64ToBytes, bytesToBase64 } from '../../shared/base64.ts';
import { sha256Hex } from '../../shared/hash.ts';

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
      if (dataURL.startsWith(ASSET_REF_PREFIX)) {
        const asset = await loadAsset(dataURL.slice(ASSET_REF_PREFIX.length));
        // Un asset ausente no se inventa: el motor mostrará la imagen como no disponible.
        if (!asset) continue;
        dataURL = bytesToDataUrl(asset.mimeType, asset.bytes);
      }
      files[id] = { ...file, dataURL } as unknown as BinaryFileData;
    }
    const restored = restore(
      { elements: data.elements ?? [], appState: data.appState ?? {}, files },
      null,
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
