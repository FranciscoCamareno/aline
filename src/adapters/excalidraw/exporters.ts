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
import {
  DOT_RADIUS,
  LINE_WIDTH,
  patternInk,
  patternMarks,
  type CanvasPattern,
} from '../../domain/canvasBackground.ts';
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
  /**
   * Estilo del fondo que se dibuja bajo los elementos (plan 10.9); solo con `background`. Sin él,
   * o liso, la exportación es la del motor.
   */
  pattern?: CanvasPattern;
}

/** Hay que dibujar el estilo del fondo: el motor no lo conoce. */
function withPattern(options: ExportOptions): CanvasPattern | null {
  return options.background && options.pattern && options.pattern !== 'plain'
    ? options.pattern
    : null;
}

/** Esquina de arriba a la izquierda de la exportación en coordenadas de la escena. */
function exportOrigin(elements: readonly NonDeleted<ExcalidrawElement>[]): [number, number] {
  const [minX, minY] = getCommonBounds(elements);
  return [minX - EXPORT_PADDING, minY - EXPORT_PADDING];
}

/**
 * Raster con el fondo y su estilo debajo de los elementos (exportados sin fondo): el patrón va
 * alineado con el origen de la escena, como en el lienzo.
 */
function rasterWithPattern(
  elementsCanvas: HTMLCanvasElement,
  elements: readonly NonDeleted<ExcalidrawElement>[],
  background: string,
  pattern: CanvasPattern,
  scale: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = elementsCanvas.width;
  out.height = elementsCanvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo preparar la imagen');
  const [ox, oy] = exportOrigin(elements);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  const marks = patternMarks(pattern, {
    x: ox,
    y: oy,
    width: out.width / scale,
    height: out.height / scale,
  });
  const ink = patternInk(background);
  ctx.fillStyle = ink;
  const line = Math.max(1, LINE_WIDTH * scale);
  for (const y of marks.rows) ctx.fillRect(0, (y - oy) * scale, out.width, line);
  for (const x of marks.columns) ctx.fillRect((x - ox) * scale, 0, line, out.height);
  for (const [x, y] of marks.dots) {
    ctx.beginPath();
    ctx.arc((x - ox) * scale, (y - oy) * scale, DOT_RADIUS * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.drawImage(elementsCanvas, 0, 0);
  elementsCanvas.width = elementsCanvas.height = 0;
  return out;
}

/** Fondo y estilo como primeros hijos del SVG (en unidades de su `viewBox`). */
function svgWithPattern(
  svg: SVGSVGElement,
  elements: readonly NonDeleted<ExcalidrawElement>[],
  background: string,
  pattern: CanvasPattern,
): void {
  const ns = 'http://www.w3.org/2000/svg';
  const box = svg.viewBox.baseVal;
  const width = box.width || Number(svg.getAttribute('width'));
  const height = box.height || Number(svg.getAttribute('height'));
  const [ox, oy] = exportOrigin(elements);
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('data-aline-background', pattern);
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('fill', background);
  group.append(rect);
  const ink = patternInk(background);
  const marks = patternMarks(pattern, { x: ox, y: oy, width, height });
  const add = (name: string, attrs: Record<string, number | string>) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    group.append(el);
  };
  for (const y of marks.rows)
    add('rect', { x: 0, y: y - oy, width, height: LINE_WIDTH, fill: ink });
  for (const x of marks.columns)
    add('rect', { x: x - ox, y: 0, width: LINE_WIDTH, height, fill: ink });
  for (const [x, y] of marks.dots)
    add('circle', { cx: x - ox, cy: y - oy, r: DOT_RADIUS, fill: ink });
  svg.insertBefore(group, svg.firstChild);
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
    // Con estilo de fondo, el fondo lo dibuja `rasterWithPattern`/`svgWithPattern`.
    exportBackground: options.background && !withPattern(options),
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
  const pattern = withPattern(options);
  if (pattern) {
    const elements = exportElements(scene, options.onlySelected);
    const canvas = await exportToCanvas({
      elements,
      appState: exportAppState(scene, options),
      files: scene.files,
      exportPadding: EXPORT_PADDING,
      getDimensions: scaled(options.scale),
    });
    const background = scene.appState.viewBackgroundColor ?? '#ffffff';
    const out = rasterWithPattern(canvas, elements, background, pattern, options.scale);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    out.width = out.height = 0;
    if (!blob) throw new Error('El navegador no pudo generar el PNG');
    return blob;
  }
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
  const pattern = withPattern(options);
  if (pattern) {
    svgWithPattern(
      svg,
      exportElements(scene, options.onlySelected),
      scene.appState.viewBackgroundColor ?? '#ffffff',
      pattern,
    );
  }
  const xml = new XMLSerializer().serializeToString(svg);
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: 'image/svg+xml' });
}

/** PDF A4 con el raster encajado en una página o paginado en vertical (§12.1). */
export async function exportPdf(
  scene: ExportScene,
  options: ExportOptions & { mode: 'fit' | 'paginate'; title: string },
): Promise<Blob> {
  const elements = exportElements(scene, options.onlySelected);
  const engineCanvas = await exportToCanvas({
    elements,
    appState: exportAppState(scene, options),
    files: scene.files,
    exportPadding: EXPORT_PADDING,
    getDimensions: scaled(options.scale),
  });
  const pattern = withPattern(options);
  const canvas = pattern
    ? rasterWithPattern(
        engineCanvas,
        elements,
        scene.appState.viewBackgroundColor ?? '#ffffff',
        pattern,
        options.scale,
      )
    : engineCanvas;
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
