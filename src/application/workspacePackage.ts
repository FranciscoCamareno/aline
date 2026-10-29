import type { Uuid } from '../domain/ids.ts';
import { isFolderKind, type DocumentRecord, type Revision } from '../domain/revision.ts';
import { z } from '../domain/zod.ts';
import type { StoredBlob, VaultContent } from '../ports/VaultRepository.ts';
import { utf8Decode, utf8Encode } from '../shared/hash.ts';
import { filesToVault, vaultToFiles, type ReadProblem, type VaultFiles } from './vaultFormat.ts';

/**
 * Paquete de un entorno de trabajo (plan 12.4–12.5, formato §2.5.5): un ZIP `.aline` con el formato
 * abierto del almacén (`vault/` como en las copias) que solo lleva el entorno, sus documentos y las
 * carpetas que los contienen, más un manifiesto. Por defecto, solo la versión vigente de cada
 * documento: el historial puede guardar texto que se borró a propósito. Lo lee otro aline (o
 * cualquiera, como un almacén); nunca se mezcla con el almacén de quien lo importa: sus documentos
 * entran en el almacén abierto, con sus identidades.
 */
export const PACKAGE_MANIFEST = 'aline-package.json';
export const PACKAGE_EXTENSION = 'aline';

export const packageManifestSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('workspace'),
  workspaceId: z.uuid(),
  title: z.string().max(300),
  createdAt: z.iso.datetime(),
  appVersion: z.string().max(40),
  /** Lleva todas las versiones (`true`) o solo la vigente de cada documento. */
  history: z.boolean(),
  documents: z
    .array(z.object({ id: z.uuid(), kind: z.string().max(40), title: z.string().max(300) }))
    .max(20_000),
});
export type PackageManifest = z.infer<typeof packageManifestSchema>;

/** Carpetas que contienen a los documentos (hasta la raíz), para que lleguen en su sitio. */
function ancestorFolders(
  documents: ReadonlyMap<Uuid, DocumentRecord>,
  members: readonly DocumentRecord[],
): DocumentRecord[] {
  const found = new Map<Uuid, DocumentRecord>();
  for (const doc of members) {
    let current = doc.folderId;
    while (current && !found.has(current)) {
      const folder = documents.get(current);
      if (!folder || folder.deleted || !isFolderKind(folder.kind)) break;
      found.set(folder.id, folder);
      current = folder.folderId;
    }
  }
  return [...found.values()];
}

function refsOf(rev: Revision): string[] {
  const { body, extensions, assets } = rev.contentRefs;
  return [body, extensions, ...assets].filter((h): h is string => !!h);
}

/**
 * Lo que va en el paquete: el entorno, sus miembros vivos (sin otros entornos) y sus carpetas, con
 * la versión vigente (todas las cabezas, si hay conflicto) o todo el historial.
 */
export function packageContent(
  content: VaultContent,
  workspaceId: Uuid,
  members: readonly Uuid[],
  options: { history: boolean },
): VaultContent {
  const byId = new Map(content.documents.map((d) => [d.id, d]));
  const workspace = byId.get(workspaceId);
  if (!workspace) throw new Error('Entorno no encontrado');
  const docs = members
    .map((id) => byId.get(id))
    .filter((d): d is DocumentRecord => !!d && !d.deleted && d.kind !== 'workspace');
  const included = [workspace, ...docs, ...ancestorFolders(byId, docs)];
  const ids = new Set(included.map((d) => d.id));
  const heads = new Set(included.flatMap((d) => d.headRevisionIds));
  const revisions = content.revisions.filter(
    (r) => ids.has(r.documentId) && (options.history || heads.has(r.id)),
  );
  const blobs = new Map<string, StoredBlob>();
  for (const rev of revisions) {
    for (const hash of refsOf(rev)) {
      const blob = content.blobs.get(hash);
      if (blob) blobs.set(hash, blob);
    }
  }
  return { vault: content.vault, documents: included, revisions, blobs, controls: [] };
}

/** Archivos del paquete (sin comprimir): el formato abierto y el manifiesto. */
export function packageFiles(
  content: VaultContent,
  manifest: Omit<PackageManifest, 'schemaVersion' | 'kind' | 'documents'>,
  options: { deviceId: string; now?: Date },
): VaultFiles {
  const files = vaultToFiles(content, options);
  const full: PackageManifest = packageManifestSchema.parse({
    schemaVersion: 1,
    kind: 'workspace',
    ...manifest,
    documents: content.documents.map((d) => ({ id: d.id, kind: d.kind, title: d.title })),
  });
  files.set(PACKAGE_MANIFEST, utf8Encode(`${JSON.stringify(full, null, 2)}\n`));
  return files;
}

export interface ReadPackage {
  manifest: PackageManifest;
  content: VaultContent;
  problems: ReadProblem[];
}

/** Lee un paquete ya descomprimido: manifiesto y contenido verificado (hashes) como una copia. */
export async function readPackageFiles(files: VaultFiles): Promise<ReadPackage> {
  const raw = files.get(PACKAGE_MANIFEST);
  if (!raw) throw new Error('No es un paquete de aline: falta el manifiesto');
  const manifest = packageManifestSchema.parse(JSON.parse(utf8Decode(raw)));
  const rest: VaultFiles = new Map([...files].filter(([path]) => path !== PACKAGE_MANIFEST));
  const { content, problems } = await filesToVault(rest);
  if (!content.documents.some((d) => d.id === manifest.workspaceId && d.kind === 'workspace')) {
    throw new Error('El paquete no trae su entorno');
  }
  return { manifest, content, problems };
}

export type ImportAction = 'new' | 'update' | 'same';

/**
 * Qué hará la importación con cada documento del paquete: crearlo, ponerle la versión nueva o
 * nada (ya tiene esa versión). `importedFrom` es la última versión del paquete que se importó en
 * este dispositivo para cada documento (sin historial no hay otra forma de saberlo).
 */
export function planImport(
  local: readonly DocumentRecord[],
  pkg: VaultContent,
  importedFrom: ReadonlyMap<Uuid, Uuid>,
  localRevisions: ReadonlySet<Uuid>,
): Array<{ document: DocumentRecord; action: ImportAction }> {
  const byId = new Map(local.map((d) => [d.id, d]));
  return pkg.documents.map((document) => {
    const mine = byId.get(document.id);
    if (!mine) return { document, action: 'new' };
    const known = document.headRevisionIds.every(
      (id) => localRevisions.has(id) || importedFrom.get(document.id) === id,
    );
    return { document, action: known ? 'same' : 'update' };
  });
}
