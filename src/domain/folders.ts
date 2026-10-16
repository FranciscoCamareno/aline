import { isFolderKind, type DocumentRecord } from './revision.ts';

/**
 * Reglas de carpetas (diseño §5 y §15): sin ciclos, sin borrado en cascada; los documentos que
 * apuntan a una carpeta retirada se muestran en una carpeta de recuperación hasta reorganizarlos.
 */
export const RECOVERY_FOLDER = '__recuperacion__';

type FolderLike = Pick<DocumentRecord, 'id' | 'kind' | 'folderId' | 'deleted'>;

/** ¿Mover `movingId` dentro de `newParentId` crearía un ciclo? */
export function wouldCreateCycle(
  documents: readonly FolderLike[],
  movingId: string,
  newParentId: string | null,
): boolean {
  const parentOf = new Map(
    documents.filter((d) => isFolderKind(d.kind)).map((d) => [d.id, d.folderId]),
  );
  let current = newParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === movingId) return true;
    if (seen.has(current)) return true; // ciclo previo en los datos: se trata como inválido
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/**
 * Carpeta en la que se muestra un documento: su carpeta si existe y no está en la papelera;
 * la de recuperación si la referencia está rota; null en la raíz.
 */
export function effectiveFolder(
  doc: Pick<DocumentRecord, 'folderId'>,
  foldersById: ReadonlyMap<string, FolderLike>,
): string | null {
  if (!doc.folderId) return null;
  const folder = foldersById.get(doc.folderId);
  return folder && !folder.deleted ? folder.id : RECOVERY_FOLDER;
}

/** Ruta de títulos desde la raíz, para mostrar dónde está un documento. */
export function folderPath(
  folderId: string | null,
  foldersById: ReadonlyMap<string, Pick<DocumentRecord, 'id' | 'title' | 'folderId'>>,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = foldersById.get(current);
    if (!folder) break;
    path.unshift(folder.title);
    current = folder.folderId;
  }
  return path;
}
