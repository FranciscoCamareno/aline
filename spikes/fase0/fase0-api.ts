import type {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
  newElementWith,
  restore,
  sceneCoordsToViewportCoords,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { excalidrawCanvasAdapter } from '../../src/adapters/excalidraw/sceneCodec.ts';
import type { BranchProjection, OpacityProjection } from './projection.ts';

/** API del banco de la fase 0, compartida por la página y las pruebas de Playwright. */
export interface LinkOpen {
  elementId: string;
  link: string;
}

export interface PenStats {
  pointerDown: Record<string, number>;
  freedrawCreated: number;
  freedrawByPointer: Record<string, number>;
  lastPointerType: string | null;
  penMode: boolean;
  penDetected: boolean;
  pressureSamples: number[];
}

export interface Fase0 {
  api: ExcalidrawImperativeAPI | null;
  mount: (elements: readonly ExcalidrawElement[], files?: BinaryFiles) => Promise<number>;
  /** Monta la escena de referencia de 1 000 elementos. */
  mountThousand: () => Promise<{ count: number; mountMs: number }>;
  linkOpens: LinkOpen[];
  pen: PenStats;
  projection: () => BranchProjection;
  opacityProjection: () => OpacityProjection;
  lib: {
    CaptureUpdateAction: typeof CaptureUpdateAction;
    convertToExcalidrawElements: typeof convertToExcalidrawElements;
    exportToBlob: typeof exportToBlob;
    exportToSvg: typeof exportToSvg;
    newElementWith: typeof newElementWith;
    restore: typeof restore;
    sceneCoordsToViewportCoords: typeof sceneCoordsToViewportCoords;
    serializeAsJSON: typeof serializeAsJSON;
  };
  codec: typeof excalidrawCanvasAdapter;
}

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
    fase0: Fase0;
  }
}
