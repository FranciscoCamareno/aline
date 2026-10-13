import { prepareExcalidrawImport } from '../adapters/excalidraw/exporters.ts';
import {
  folderPaths,
  ImportError,
  markdownToNote,
  markdownTree,
  safeFilename,
} from '../application/portability.ts';
import type { DocumentRecord } from '../domain/revision.ts';
import { describeError } from '../ports/Diagnostics.ts';
import { utf8Encode } from '../shared/hash.ts';
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

/**
 * Exporta como ZIP las notas Markdown de una carpeta (con sus subcarpetas) o de todo el almacén
 * (RF-35, diseño §12.1). Cada archivo es la versión vigente con su frontmatter.
 */
export async function exportMarkdownZip(
  services: AppServices,
  folderId: string | null,
): Promise<number> {
  const documents = await services.service.listDocuments();
  const tree = markdownTree(documents, folderId);
  const files = new Map<string, Uint8Array>();
  for (const [path, id] of tree) {
    files.set(path, utf8Encode(await services.service.exportNoteMarkdown(id)));
  }
  const bytes = await createZipWorkerArchiver().zip(files);
  const folder = folderId ? documents.find((d) => d.id === folderId)?.title : null;
  downloadBlob(
    safeFilename(`${folder ?? services.vault.name} - Markdown ${fileTimestamp()}`, 'zip'),
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
  );
  return tree.size;
}
