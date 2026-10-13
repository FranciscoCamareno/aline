import {
  exportToBlob,
  exportToCanvas,
  exportToSvg,
  getCommonBounds,
  restore,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFileData, BinaryFiles } from '@excalidraw/excalidraw/types';
import {
  analyzeExcalidraw,
  EXPORT_PADDING,
  planPdf,
  rasterSize,
  type ExcalidrawImport,
  type ExportSize,
} from '../../application/portability.ts';
import type { CanvasExtensions } from '../../domain/sidecar.ts';
import type { SerializedCanvas } from '../../ports/CanvasAdapter.ts';
import { excalidrawCanvasAdapter } from './sceneCodec.ts';
import { currentBindings, deriveExtensions } from './sidecar.ts';

/**
 * Exportación e importación con las utilidades de la versión fijada del motor (diseño §12.1).
 * PNG y SVG los produce Excalidraw; el PDF inserta el raster con jsPDF (sin vectores, como
 * decide el diseño), encajado o paginado.
 */

export interface ExportScene {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

export interface ExportOptions {
  background: boolean;
  scale: number;
  /** Solo los elementos seleccionados (FA-05a). */
  onlySelected: boolean;
}

/** Elementos que se exportan: visibles y, si se pide, solo la selección. */
export function exportElements(
  scene: ExportScene,
  onlySelected: boolean,
): NonDeleted<ExcalidrawElement>[] {
  const visible = scene.elements.filter((e) => !e.isDeleted) as NonDeleted<ExcalidrawElement>[];
  if (!onlySelected) return visible;
  const selected = scene.appState.selectedElementIds ?? {};
  const ids = new Set(Object.keys(selected).filter((id) => selected[id]));
  // Los textos dentro de formas acompañan a su contenedor.
  return visible.filter(
    (e) => ids.has(e.id) || ('containerId' in e && e.containerId && ids.has(e.containerId)),
  );
}

export function sceneBounds(elements: readonly NonDeleted<ExcalidrawElement>[]): ExportSize {
  if (!elements.length) return { width: 0, height: 0 };
  const [minX, minY, maxX, maxY] = getCommonBounds(elements);
  return { width: maxX - minX, height: maxY - minY };
}

function exportAppState(scene: ExportScene, options: ExportOptions): Partial<AppState> {
  return {
    exportBackground: options.background,
    viewBackgroundColor: scene.appState.viewBackgroundColor ?? '#ffffff',
    exportWithDarkMode: false,
    exportEmbedScene: false,
    exportScale: options.scale,
  };
}

const scaled = (scale: number) => (width: number, height: number) => ({
  width: Math.ceil(width * scale),
  height: Math.ceil(height * scale),
  scale,
});

export async function exportPng(scene: ExportScene, options: ExportOptions): Promise<Blob> {
  return exportToBlob({
    elements: exportElements(scene, options.onlySelected),
    appState: exportAppState(scene, options),
    files: scene.files,
    mimeType: 'image/png',
    exportPadding: EXPORT_PADDING,
    getDimensions: scaled(options.scale),
  });
}

export async function exportSvg(scene: ExportScene, options: ExportOptions): Promise<Blob> {
  const svg = await exportToSvg({
    elements: exportElements(scene, options.onlySelected),
    appState: exportAppState(scene, options),
    files: scene.files,
    exportPadding: EXPORT_PADDING,
    // Nunca se incrusta contenido web remoto (diseño §13).
    renderEmbeddables: false,
  });
  const xml = new XMLSerializer().serializeToString(svg);
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: 'image/svg+xml' });
}

/** PDF A4 con el raster encajado en una página o paginado en vertical (§12.1). */
export async function exportPdf(
  scene: ExportScene,
  options: ExportOptions & { mode: 'fit' | 'paginate'; title: string },
): Promise<Blob> {
  const elements = exportElements(scene, options.onlySelected);
  const canvas = await exportToCanvas({
    elements,
    appState: exportAppState(scene, options),
    files: scene.files,
    exportPadding: EXPORT_PADDING,
    getDimensions: scaled(options.scale),
  });
  const raster = { width: canvas.width, height: canvas.height };
  const plan = planPdf(raster, options.mode);
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: plan.orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  pdf.setProperties({ title: options.title, creator: 'Aline' });
  const slice = document.createElement('canvas');
  plan.pages.forEach((tile, index) => {
    if (index > 0) pdf.addPage('a4', plan.orientation);
    slice.width = tile.sw;
    slice.height = tile.sh;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo preparar la página del PDF');
    ctx.clearRect(0, 0, tile.sw, tile.sh);
    ctx.drawImage(canvas, tile.sx, tile.sy, tile.sw, tile.sh, 0, 0, tile.sw, tile.sh);
    pdf.addImage(slice, 'PNG', tile.x, tile.y, tile.w, tile.h, undefined, 'FAST');
  });
  // Libera la memoria de los lienzos grandes cuanto antes (iPad).
  canvas.width = canvas.height = slice.width = slice.height = 0;
  return pdf.output('blob');
}

/** Tamaño del raster que produciría la exportación (para avisar antes de exportar). */
export function exportRasterSize(scene: ExportScene, options: ExportOptions): ExportSize {
  return rasterSize(sceneBounds(exportElements(scene, options.onlySelected)), options.scale);
}

/**
 * `.excalidraw` autocontenido (RF-45): mismas utilidades del motor, con las imágenes
 * incrustadas como dataURL (la escena en memoria ya las tiene rehidratadas).
 */
export function exportExcalidraw(scene: ExportScene): Blob {
  const json = serializeAsJSON(scene.elements, scene.appState, scene.files, 'local');
  return new Blob([json], { type: 'application/vnd.excalidraw+json' });
}

export interface PreparedImport {
  canvas: SerializedCanvas;
  extensionsFor: (base: CanvasExtensions) => CanvasExtensions;
  issues: ExcalidrawImport['issues'];
  elementCount: number;
}

/**
 * Importa un .excalidraw (RF-34, CA-18): valida, descarta lo no soportado (con su lista),
 * normaliza con `restore` del motor y serializa con el adaptador (imágenes como assets).
 */
export async function prepareExcalidrawImport(
  text: string,
  byteLength: number,
): Promise<PreparedImport> {
  const analyzed = analyzeExcalidraw(text, byteLength);
  const restored = restore(
    {
      elements: analyzed.elements as unknown as ExcalidrawElement[],
      appState: analyzed.appState as Partial<AppState>,
      files: analyzed.files as unknown as Record<string, BinaryFileData>,
    },
    null,
    null,
  );
  const scene = {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
  };
  const canvas = await excalidrawCanvasAdapter.serialize(scene);
  return {
    canvas,
    extensionsFor: (base) => deriveExtensions(base, restored.elements, currentBindings([])),
    issues: analyzed.issues,
    elementCount: restored.elements.filter((e) => !e.isDeleted).length,
  };
}
