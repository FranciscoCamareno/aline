import { DexieSyncStore } from '../adapters/indexeddb/DexieSyncStore.ts';
import { exportPng } from '../adapters/excalidraw/exporters.ts';
import { excalidrawCanvasAdapter } from '../adapters/excalidraw/sceneCodec.ts';
import { hiddenElementIds } from '../application/canvasTargets.ts';
import { safeFilename } from '../application/portability.ts';
import {
  PACKAGE_EXTENSION,
  packageContent,
  packageFiles,
  readPackageFiles,
  type ReadPackage,
} from '../application/workspacePackage.ts';
import { expandEvents, localDate } from '../domain/calendar.ts';
import { parentsFirst } from '../domain/revision.ts';
import { richDocToMarkdown } from '../domain/richDocMarkdown.ts';
import { DEFAULT_UNZIP_LIMITS } from '../ports/Archiver.ts';
import { isPasswordSealed, openWithPassword, sealWithPassword } from '../shared/crypto.ts';
import { utf8Encode } from '../shared/hash.ts';
import { browserDocxImage, docxBlob } from '../features/docs/exportDocx.ts';
import { withBakedImages } from '../features/docs/imageBake.ts';
import { createZipWorkerArchiver } from '../workers/zipClient.ts';
import { downloadBlob } from './download.ts';
import { downloadZip, withAssetFiles, type AssetLoader } from './importExport.ts';
import type { AppServices } from './services.ts';

/**
 * Compartir un entorno de trabajo (plan 12.4–12.6): el paquete `.aline` para otro aline (con
 * cifrado opcional) y una carpeta legible para quien no lo usa. Nada sale a la red: todo se
 * descarga como archivo y quien lo envía decide por dónde.
 */

/** Datos autenticados del cifrado: un paquete no se confunde con otro archivo cifrado. */
const PACKAGE_LABEL = 'aline-package|1';

/** La importación necesita la contraseña (paquete cifrado) o la que se dio no vale. */
export class PackagePasswordError extends Error {
  readonly reason: 'needed' | 'wrong';
  constructor(reason: 'needed' | 'wrong') {
    super(reason === 'needed' ? 'Paquete cifrado' : 'Contraseña incorrecta');
    this.reason = reason;
  }
}

export async function exportWorkspacePackage(
  services: AppServices,
  workspaceId: string,
  title: string,
  options: { history: boolean; password: string | null },
): Promise<void> {
  const { service, device } = services;
  const content = await service.exportContent();
  const { workspace } = await service.readWorkspace(workspaceId);
  const subset = packageContent(content, workspaceId, workspace.members, {
    history: options.history,
  });
  const files = packageFiles(
    subset,
    {
      workspaceId,
      title,
      createdAt: new Date().toISOString(),
      appVersion: __APP_VERSION__,
      history: options.history,
    },
    { deviceId: device.deviceId },
  );
  let bytes = await createZipWorkerArchiver().zip(files);
  if (options.password) bytes = await sealWithPassword(bytes, options.password, PACKAGE_LABEL);
  downloadBlob(
    safeFilename(title, PACKAGE_EXTENSION),
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
  );
}

/** Lee un paquete: descifra si hace falta, descomprime con límites y verifica cada objeto. */
export async function readWorkspacePackage(
  file: Blob,
  password: string | null,
): Promise<ReadPackage> {
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  if (isPasswordSealed(bytes)) {
    if (!password) throw new PackagePasswordError('needed');
    try {
      bytes = await openWithPassword(bytes, password, PACKAGE_LABEL);
    } catch {
      throw new PackagePasswordError('wrong');
    }
  }
  const { files } = await createZipWorkerArchiver().unzip(bytes, DEFAULT_UNZIP_LIMITS);
  return readPackageFiles(files);
}

export interface ImportSummary {
  created: number;
  updated: number;
  conflicts: number;
  same: number;
}

/**
 * Importa un paquete en el almacén abierto. Con historial, sus versiones entran tal cual (como al
 * sincronizar: si se separaron, quedan en conflicto); sin historial, cada documento entra como una
 * versión nueva encima de lo importado antes (`VaultService.importPackageVersions`).
 */
export async function importWorkspacePackage(
  services: AppServices,
  pkg: ReadPackage,
): Promise<ImportSummary> {
  const { service, knowledge, repo } = services;
  if (!pkg.manifest.history) {
    const summary = await service.importPackageVersions(pkg.content);
    return summary;
  }
  const before = new Map((await service.listDocuments()).map((d) => [d.id, d]));
  await new DexieSyncStore(repo.db).applyRemote(parentsFirst(pkg.content.revisions), [
    ...pkg.content.blobs.values(),
  ]);
  await knowledge.sync();
  const after = new Map((await service.listDocuments()).map((d) => [d.id, d]));
  const summary: ImportSummary = { created: 0, updated: 0, conflicts: 0, same: 0 };
  for (const doc of pkg.content.documents) {
    const old = before.get(doc.id);
    const now = after.get(doc.id);
    if (!old) summary.created++;
    else if ((now?.headRevisionIds.length ?? 0) > 1) summary.conflicts++;
    else if (old.headRevisionIds.join() === now?.headRevisionIds.join()) summary.same++;
    else summary.updated++;
  }
  return summary;
}

/**
 * Para quien no usa aline (plan 12.6): un ZIP con una carpeta por entorno. Notas y documentos
 * Markdown tal cual (`.md`, imágenes en `assets/`), documentos con formato en Word (`.docx`) y en
 * Markdown, lienzos en PNG y en `.excalidraw` (se abre en excalidraw.com), calendarios como una
 * lista de sus próximos eventos en Markdown.
 */
export async function exportWorkspaceReadable(
  services: AppServices,
  workspaceId: string,
  title: string,
  labels: { tabLabel: (n: number) => string; upcoming: string },
): Promise<number> {
  const { service } = services;
  const { workspace } = await service.readWorkspace(workspaceId);
  const documents = new Map((await service.listDocuments()).map((d) => [d.id, d]));
  const files = new Map<string, Uint8Array>();
  const load: AssetLoader = (hash) => service.loadAsset(hash);
  const used = new Set<string>();
  /** Nombre de archivo único dentro de la carpeta. */
  const name = (base: string, ext: string) => {
    let candidate = safeFilename(base, ext);
    for (let n = 2; used.has(candidate); n++) candidate = safeFilename(`${base} (${n})`, ext);
    used.add(candidate);
    return candidate;
  };
  let count = 0;
  for (const id of workspace.members) {
    const doc = documents.get(id);
    if (!doc || doc.deleted) continue;
    count++;
    if (doc.kind === 'note' || doc.kind === 'mddoc') {
      const markdown = await service.exportNoteMarkdown(id);
      files.set(name(doc.title, 'md'), utf8Encode(await withAssetFiles(markdown, load, files, '')));
    } else if (doc.kind === 'doc') {
      const baked = await withBakedImages(await service.exportRichDoc(id), load);
      const markdown = richDocToMarkdown(baked.doc, { tabLabel: labels.tabLabel }).markdown;
      files.set(
        name(doc.title, 'md'),
        utf8Encode(await withAssetFiles(markdown, baked.load, files, '')),
      );
      const docx = await docxBlob(baked.doc, {
        title: doc.title,
        tabLabel: labels.tabLabel,
        image: async (hash) => {
          const asset = await baked.load(hash);
          return asset ? browserDocxImage(asset) : null;
        },
      });
      files.set(name(doc.title, 'docx'), new Uint8Array(await docx.arrayBuffer()));
    } else if (doc.kind === 'canvas') {
      const { sceneJson, extensions } = await service.readCanvas(id);
      if (!sceneJson) continue;
      files.set(name(doc.title, 'excalidraw'), utf8Encode(sceneJson));
      const scene = await excalidrawCanvasAdapter.deserialize(sceneJson, (hash) =>
        service.loadAsset(hash),
      );
      const hidden = hiddenElementIds(extensions);
      const elements = scene.elements.filter((e) => !e.isDeleted && !hidden.has(e.id));
      if (elements.length) {
        const png = await exportPng(
          { elements, appState: scene.appState, files: scene.files },
          { background: true, scale: 2, onlySelected: false },
        );
        files.set(name(doc.title, 'png'), new Uint8Array(await png.arrayBuffer()));
      }
    } else if (doc.kind === 'calendar') {
      const { events } = await service.readCalendar(id);
      const today = localDate(new Date());
      const until = localDate(new Date(Date.now() + 365 * 24 * 3600 * 1000));
      const lines = expandEvents(events, today, until).map(
        (e) => `- ${e.date}${e.start ? ` ${e.start}–${e.end ?? ''}` : ''} · ${e.title}`,
      );
      files.set(
        name(doc.title, 'md'),
        utf8Encode(`# ${doc.title}\n\n## ${labels.upcoming}\n\n${lines.join('\n')}\n`),
      );
    }
  }
  await downloadZip(title, files);
  return count;
}
