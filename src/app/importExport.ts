import { prepareExcalidrawImport } from '../adapters/excalidraw/exporters.ts';
import {
  folderPaths,
  ImportError,
  markdownToNote,
  markdownTree,
  safeFilename,
} from '../application/portability.ts';
import { markdownAssetRefs } from '../domain/docAssets.ts';
import type { RichDocData } from '../domain/richDoc.ts';
import { relinkAssets, richDocToMarkdown, type MarkdownLoss } from '../domain/richDocMarkdown.ts';
import type { DocumentRecord } from '../domain/revision.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { utf8Encode } from '../shared/hash.ts';
import { withBakedImages } from '../features/docs/imageBake.ts';
import { createZipWorkerArchiver } from '../workers/zipClient.ts';
import { downloadBlob, fileTimestamp } from './download.ts';
import { logDiagnostic } from './runtime.ts';
import type { AppServices } from './services.ts';

/** Aviso de una importación: clave de traducción (`import.*`) y sus parámetros. */
export interface ImportProblem {
  file: string;
  key: string;
  params?: Record<string, string | number>;
}

export interface ImportReport {
  created: DocumentRecord[];
  problems: ImportProblem[];
}

const MARKDOWN = /\.(md|markdown|txt)$/i;
const EXCALIDRAW = /\.(excalidraw|json)$/i;

/** Ruta relativa al elegir una carpeta (`webkitRelativePath`), sin la carpeta raíz elegida. */
function relativePath(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const parts = rel.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : rel;
}

/**
 * Importa notas Markdown y lienzos .excalidraw (RF-34, RF-35). Cada archivo se convierte en un
 * documento nuevo (UUID nuevo, diseño §12.1); las subcarpetas de una carpeta elegida se crean
 * dentro de `folderId`. Lo que no se importa, o se importa con cambios, queda en el informe.
 */
export async function importFiles(
  services: AppServices,
  files: readonly File[],
  folderId: string | null,
): Promise<ImportReport> {
  const report: ImportReport = { created: [], problems: [] };
  const paths = files.map(relativePath);
  const folderIds = new Map<string, string | null>([['', folderId]]);
  for (const path of folderPaths(paths.filter((p) => MARKDOWN.test(p) || EXCALIDRAW.test(p)))) {
    const parts = path.split('/');
    const parent = folderIds.get(parts.slice(0, -1).join('/')) ?? folderId;
    const folder = await services.service.createFolder(parts.at(-1)!, parent);
    folderIds.set(path, folder.id);
  }

  for (const [index, file] of files.entries()) {
    const path = paths[index]!;
    const target = folderIds.get(path.split('/').slice(0, -1).join('/')) ?? folderId;
    try {
      if (MARKDOWN.test(file.name)) {
        const note = markdownToNote(file.name, await file.text());
        report.created.push(await services.service.importNote({ ...note, folderId: target }));
        if (note.droppedKeys.length) {
          report.problems.push({
            file: path,
            key: 'import.droppedKeys',
            params: { keys: note.droppedKeys.join(', ') },
          });
        }
        if (note.frontmatterAsText) {
          report.problems.push({ file: path, key: 'import.frontmatterAsText' });
        }
      } else if (EXCALIDRAW.test(file.name)) {
        const prepared = await prepareExcalidrawImport(await file.text(), file.size);
        report.created.push(
          await services.service.importCanvas({
            title: file.name.replace(EXCALIDRAW, '').trim() || 'Lienzo importado',
            canvas: prepared.canvas,
            folderId: target,
            extensionsFor: prepared.extensionsFor,
          }),
        );
        for (const issue of prepared.issues) {
          report.problems.push({
            file: path,
            key: `import.issues.${issue.issue}`,
            params: { count: issue.count, types: issue.types?.join(', ') ?? '' },
          });
        }
      } else {
        report.problems.push({ file: path, key: 'import.unsupported' });
      }
    } catch (error) {
      logDiagnostic('warn', 'import-failed', describeError(error));
      report.problems.push({
        file: path,
        key: error instanceof ImportError ? `import.errors.${error.reason}` : 'import.failed',
      });
    }
  }
  return report;
}

/** Extensión de archivo de una imagen del almacén (DOC_IMAGE_TYPES). */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

type AssetLoader = (hash: string) => Promise<{ mimeType: string; bytes: Uint8Array } | undefined>;

/**
 * Las imágenes que cita un Markdown (`mindnote-asset:<sha256>`) pasan a ser archivos de
 * `<dir>assets/` y el texto las cita con su ruta relativa (plan 9.8). Las que ya no existen se
 * quedan como estaban: nunca se falla por una cita rota.
 */
async function withAssetFiles(
  markdown: string,
  loadAsset: AssetLoader,
  files: Map<string, Uint8Array>,
  dir: string,
): Promise<string> {
  const paths = new Map<string, string>();
  for (const hash of markdownAssetRefs(markdown)) {
    const asset = await loadAsset(hash);
    if (!asset) continue;
    const name = `assets/${hash.slice(0, 16)}.${IMAGE_EXTENSIONS[asset.mimeType] ?? 'bin'}`;
    files.set(dir + name, asset.bytes);
    paths.set(hash, name);
  }
  const depth = dir.split('/').length - 1;
  return relinkAssets(markdown, (hash) => {
    const name = paths.get(hash);
    return name ? '../'.repeat(depth) + name : `mindnote-asset:${hash}`;
  });
}

function downloadZip(name: string, files: Map<string, Uint8Array>): Promise<void> {
  return createZipWorkerArchiver()
    .zip(files)
    .then((bytes) =>
      downloadBlob(
        safeFilename(name, 'zip'),
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
      ),
    );
}

/**
 * «Exportar → Markdown» de un documento con formato (plan 9.8): un `.md`, o un ZIP con el `.md`
 * y sus imágenes en `assets/` si tiene alguna. Devuelve lo que Markdown no pudo conservar.
 */
export async function exportRichDocMarkdown(
  doc: RichDocData,
  title: string,
  options: { tabLabel: (n: number) => string; loadAsset: AssetLoader },
): Promise<MarkdownLoss[]> {
  const { markdown, dropped } = richDocToMarkdown(doc, options);
  await downloadMarkdown(markdown, title, options.loadAsset);
  return dropped;
}

/** Un `.md`, o un ZIP con el `.md` y sus imágenes en `assets/` si cita alguna del almacén. */
export async function downloadMarkdown(
  markdown: string,
  title: string,
  loadAsset: AssetLoader,
): Promise<void> {
  const files = new Map<string, Uint8Array>();
  const linked = await withAssetFiles(markdown, loadAsset, files, '');
  if (!files.size) {
    downloadBlob(
      safeFilename(title, 'md'),
      new Blob([linked], { type: 'text/markdown;charset=utf-8' }),
    );
    return;
  }
  files.set(safeFilename(title, 'md'), utf8Encode(linked));
  await downloadZip(title, files);
}

/**
 * Exporta como ZIP los Markdown de una carpeta (con sus subcarpetas) o de todo el almacén
 * (RF-35, diseño §12.1; documentos desde el plan 9.9): las notas y los documentos Markdown tal
 * como se guardan, con su frontmatter, y los documentos con formato convertidos. Las imágenes
 * van a `assets/` junto a cada archivo.
 */
export async function exportMarkdownZip(
  services: AppServices,
  folderId: string | null,
  labels: { documentsDir: string; tabLabel: (n: number) => string },
): Promise<number> {
  const { service } = services;
  const documents = await service.listDocuments();
  const tree = markdownTree(documents, folderId, labels.documentsDir);
  const files = new Map<string, Uint8Array>();
  const loadAsset: AssetLoader = (hash) => service.loadAsset(hash);
  for (const [path, { id, kind }] of tree) {
    let markdown: string;
    let load = loadAsset;
    if (kind === 'doc') {
      // Imágenes recortadas o giradas, ya generadas así (plan 10.8).
      const baked = await withBakedImages(await service.exportRichDoc(id), loadAsset);
      markdown = richDocToMarkdown(baked.doc, labels).markdown;
      load = baked.load;
    } else {
      markdown = await service.exportNoteMarkdown(id);
    }
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    files.set(path, utf8Encode(await withAssetFiles(markdown, load, files, dir)));
  }
  const folder = folderId ? documents.find((d) => d.id === folderId)?.title : null;
  await downloadZip(`${folder ?? services.vault.name} - Markdown ${fileTimestamp()}`, files);
  return tree.size;
}
