import type { DocumentRecord } from '../domain/revision.ts';
import { effectiveFolder, RECOVERY_FOLDER } from '../domain/folders.ts';
import { parseNoteMarkdown } from '../domain/frontmatter.ts';
import { parseInternalLink } from './knowledge.ts';

/**
 * Reglas de exportación e importación (diseño §12.1; RF-33, RF-34, RF-35, RF-45, FA-05a).
 * Puras: el adaptador del lienzo y la interfaz hacen el renderizado y los archivos.
 */

/**
 * Presupuesto de píxeles de una exportación rasterizada. Safari en iPad no crea lienzos de más
 * de 16 777 216 píxeles (4096 × 4096); por encima se ofrece bajar la escala, exportar la
 * selección o paginar (FA-05a). Nunca se trunca en silencio.
 */
export const EXPORT_PIXEL_BUDGET = 16_777_216;
/** Margen alrededor del contenido en las exportaciones, en unidades de escena. */
export const EXPORT_PADDING = 10;

export interface ExportSize {
  width: number;
  height: number;
}

/** Tamaño en píxeles del raster para unos límites de escena y una escala. */
export function rasterSize(bounds: ExportSize, scale: number): ExportSize {
  return {
    width: Math.ceil((bounds.width + EXPORT_PADDING * 2) * scale),
    height: Math.ceil((bounds.height + EXPORT_PADDING * 2) * scale),
  };
}

export function fitsBudget(bounds: ExportSize, scale: number): boolean {
  const { width, height } = rasterSize(bounds, scale);
  return width * height <= EXPORT_PIXEL_BUDGET;
}

/** Mayor escala (con dos decimales, a la baja) que cabe en el presupuesto. */
export function maxScale(bounds: ExportSize): number {
  const area = (bounds.width + EXPORT_PADDING * 2) * (bounds.height + EXPORT_PADDING * 2);
  if (area <= 0) return 1;
  return Math.floor(Math.sqrt(EXPORT_PIXEL_BUDGET / area) * 100) / 100;
}

/** Página PDF en milímetros (A4) y margen. */
export const A4 = { width: 210, height: 297, margin: 10 } as const;

export interface PdfTile {
  /** Recorte del raster, en píxeles. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Posición y tamaño en la página, en milímetros. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPlan {
  orientation: 'portrait' | 'landscape';
  pageWidth: number;
  pageHeight: number;
  pages: PdfTile[];
}

/**
 * Reparto del raster en páginas A4 (diseño §12.1: «encajar o paginar»). `fit` encaja todo en
 * una página; `paginate` mantiene el ancho de página y corta en vertical, sin perder nada.
 */
export function planPdf(raster: ExportSize, mode: 'fit' | 'paginate'): PdfPlan {
  const landscape = raster.width > raster.height;
  const pageWidth = landscape ? A4.height : A4.width;
  const pageHeight = landscape ? A4.width : A4.height;
  const areaW = pageWidth - A4.margin * 2;
  const areaH = pageHeight - A4.margin * 2;
  const orientation = landscape ? 'landscape' : 'portrait';

  if (mode === 'fit') {
    const ratio = Math.min(areaW / raster.width, areaH / raster.height);
    const w = raster.width * ratio;
    const h = raster.height * ratio;
    return {
      orientation,
      pageWidth,
      pageHeight,
      pages: [
        {
          sx: 0,
          sy: 0,
          sw: raster.width,
          sh: raster.height,
          x: (pageWidth - w) / 2,
          y: (pageHeight - h) / 2,
          w,
          h,
        },
      ],
    };
  }

  const mmPerPx = areaW / raster.width;
  const slice = Math.max(1, Math.floor(areaH / mmPerPx));
  const pages: PdfTile[] = [];
  for (let sy = 0; sy < raster.height; sy += slice) {
    const sh = Math.min(slice, raster.height - sy);
    pages.push({
      sx: 0,
      sy,
      sw: raster.width,
      sh,
      x: A4.margin,
      y: A4.margin,
      w: areaW,
      h: sh * mmPerPx,
    });
  }
  return { orientation, pageWidth, pageHeight, pages };
}

/** Nombre de archivo seguro en Windows, macOS e iPadOS. */
export function safeFilename(title: string, extension: string): string {
  const base =
    title
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/, '')
      .trim()
      .slice(0, 120) || 'sin-titulo';
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base) ? `_${base}` : base;
  return `${reserved}.${extension}`;
}

/** Lo que una exportación .excalidraw no conserva (RF-45, CA-30). */
export type ExcalidrawLoss = 'internal-links' | 'product-semantics';

export function excalidrawExportLosses(
  elements: ReadonlyArray<{ link?: string | null; isDeleted?: boolean }>,
): Array<{ loss: ExcalidrawLoss; count: number }> {
  const internal = elements.filter(
    (e) => !e.isDeleted && e.link && parseInternalLink(e.link),
  ).length;
  return [
    ...(internal ? [{ loss: 'internal-links' as const, count: internal }] : []),
    // Siempre: backlinks, historial, carpetas, etiquetas e identidad de notas (§12.1).
    { loss: 'product-semantics', count: 0 },
  ];
}

/** Tipos de elemento del motor que se importan tal cual. */
const SUPPORTED_TYPES = new Set([
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
  'image',
  'frame',
  'magicframe',
]);
/** Contenido remoto incrustado: se descarta por privacidad (diseño §13, RNF-05). */
const BLOCKED_TYPES = new Set(['embeddable', 'iframe']);

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const MAX_IMPORT_ELEMENTS = 50_000;

export type ImportIssue =
  | 'embedded-web-content'
  | 'unknown-element'
  | 'missing-image'
  | 'remote-image'
  | 'deleted-elements';

export interface ExcalidrawImport {
  elements: Array<Record<string, unknown>>;
  appState: Record<string, unknown>;
  files: Record<string, { id: string; mimeType: string; dataURL: string; created: number }>;
  issues: Array<{ issue: ImportIssue; count: number; types?: string[] }>;
}

export class ImportError extends Error {
  readonly reason: 'too-large' | 'not-excalidraw' | 'library' | 'too-many-elements';

  constructor(reason: ImportError['reason']) {
    super(`Importación rechazada: ${reason}`);
    this.name = 'ImportError';
    this.reason = reason;
  }
}

/**
 * Valida un .excalidraw y separa lo soportado (RF-34, CA-18). No modifica la entrada; lo que
 * no se importa queda listado con su motivo.
 */
export function analyzeExcalidraw(text: string, byteLength: number): ExcalidrawImport {
  if (byteLength > MAX_IMPORT_BYTES) throw new ImportError('too-large');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('not-excalidraw');
  }
  if (typeof data !== 'object' || data === null) throw new ImportError('not-excalidraw');
  const raw = data as { type?: unknown; elements?: unknown; appState?: unknown; files?: unknown };
  if (raw.type === 'excalidrawlib') throw new ImportError('library');
  if (raw.type !== 'excalidraw' || !Array.isArray(raw.elements)) {
    throw new ImportError('not-excalidraw');
  }
  if (raw.elements.length > MAX_IMPORT_ELEMENTS) throw new ImportError('too-many-elements');

  const files: ExcalidrawImport['files'] = {};
  let remoteImages = 0;
  if (typeof raw.files === 'object' && raw.files !== null) {
    for (const [id, file] of Object.entries(raw.files as Record<string, unknown>)) {
      const f = file as { mimeType?: unknown; dataURL?: unknown; created?: unknown };
      if (typeof f.dataURL !== 'string' || typeof f.mimeType !== 'string') continue;
      // Solo datos incrustados: una URL remota haría una petición al mostrarla.
      if (!f.dataURL.startsWith('data:')) {
        remoteImages++;
        continue;
      }
      files[id] = {
        id,
        mimeType: f.mimeType,
        dataURL: f.dataURL,
        created: typeof f.created === 'number' ? f.created : Date.now(),
      };
    }
  }

  const elements: Array<Record<string, unknown>> = [];
  const blocked: string[] = [];
  const unknown: string[] = [];
  let missingImages = 0;
  let deleted = 0;
  for (const value of raw.elements as unknown[]) {
    if (typeof value !== 'object' || value === null) continue;
    const element = value as Record<string, unknown>;
    const type = String(element['type']);
    if (element['isDeleted'] === true) {
      deleted++;
      continue;
    }
    if (BLOCKED_TYPES.has(type)) {
      blocked.push(type);
      continue;
    }
    if (!SUPPORTED_TYPES.has(type)) {
      unknown.push(type);
      continue;
    }
    if (type === 'image' && !(typeof element['fileId'] === 'string' && files[element['fileId']])) {
      missingImages++;
    }
    elements.push(element);
  }

  const issues: ExcalidrawImport['issues'] = [];
  if (blocked.length) {
    issues.push({
      issue: 'embedded-web-content',
      count: blocked.length,
      types: [...new Set(blocked)],
    });
  }
  if (unknown.length) {
    issues.push({ issue: 'unknown-element', count: unknown.length, types: [...new Set(unknown)] });
  }
  if (missingImages) issues.push({ issue: 'missing-image', count: missingImages });
  if (remoteImages) issues.push({ issue: 'remote-image', count: remoteImages });
  if (deleted) issues.push({ issue: 'deleted-elements', count: deleted });

  const appState =
    typeof raw.appState === 'object' && raw.appState !== null
      ? (raw.appState as Record<string, unknown>)
      : {};
  return { elements, appState, files, issues };
}

/** Nota lista para importar a partir de un archivo Markdown (RF-35). */
export interface MarkdownImport {
  title: string;
  body: string;
  tags: string[];
  /** Claves de frontmatter que no forman parte del modelo y no se conservan. */
  droppedKeys: string[];
  /** El frontmatter no se reconoció y quedó como texto al inicio del cuerpo. */
  frontmatterAsText: boolean;
}

export function markdownToNote(fileName: string, text: string): MarkdownImport {
  const fallbackTitle = fileName.replace(/\.(md|markdown|txt)$/i, '').trim() || 'Nota importada';
  const parsed = parseNoteMarkdown(text.replace(/^\uFEFF/, ''));
  if (!parsed.frontmatter) {
    return {
      title: fallbackTitle,
      body: parsed.body,
      tags: [],
      droppedKeys: [],
      frontmatterAsText: parsed.invalid,
    };
  }
  const fm = parsed.frontmatter;
  return {
    // Siempre un UUID nuevo: importar crea una copia (diseño §12.1).
    title: fm.title.trim() || fallbackTitle,
    body: parsed.body,
    tags: fm.tags,
    droppedKeys: fm.extra.map(([key]) => key),
    frontmatterAsText: false,
  };
}

/**
 * Carpetas que hay que crear para importar archivos con rutas relativas (`a/b/nota.md`).
 * Devuelve las rutas de carpeta en orden padre → hijo.
 */
export function folderPaths(relativePaths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const path of relativePaths) {
    const parts = path.split('/').filter(Boolean).slice(0, -1);
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return [...out].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}

/**
 * Árbol de archivos Markdown de una carpeta (o de todo el almacén con `rootId` null):
 * ruta relativa → id de nota. Las subcarpetas se convierten en directorios y los nombres
 * repetidos reciben un sufijo «(2)», «(3)»…
 */
export function markdownTree(
  documents: readonly DocumentRecord[],
  rootId: string | null,
): Map<string, string> {
  const live = documents.filter((d) => !d.deleted);
  const folders = new Map(documents.filter((d) => d.kind === 'folder').map((d) => [d.id, d]));
  const parentOf = new Map(live.map((d) => [d.id, effectiveFolder(d, folders)]));
  const out = new Map<string, string>();
  const walk = (folderId: string | null, prefix: string, seen: Set<string>) => {
    const used = new Set<string>();
    const unique = (name: string, ext: string) => {
      let candidate = safeFilename(name, ext);
      for (let n = 2; used.has(candidate.toLowerCase()); n++) {
        candidate = safeFilename(`${name} (${n})`, ext);
      }
      used.add(candidate.toLowerCase());
      return candidate;
    };
    const children = live
      .filter((d) => parentOf.get(d.id) === folderId)
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const doc of children) {
      if (doc.kind === 'note') out.set(prefix + unique(doc.title, 'md'), doc.id);
    }
    for (const folder of children.filter((d) => d.kind === 'folder')) {
      if (seen.has(folder.id)) continue; // defensa ante ciclos corruptos
      const dir = unique(folder.title, 'dir').replace(/\.dir$/, '');
      walk(folder.id, `${prefix}${dir}/`, new Set([...seen, folder.id]));
    }
  };
  walk(rootId, '', new Set(rootId ? [rootId] : []));
  // Todo el almacén: lo que quedó sin carpeta válida también se exporta (como en la biblioteca).
  if (rootId === null) walk(RECOVERY_FOLDER, 'Recuperados/', new Set());
  return out;
}
