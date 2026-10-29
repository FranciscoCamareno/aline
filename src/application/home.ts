import { effectiveFolder, wouldCreateCycle } from '../domain/folders.ts';
import { folderKindFor, isFolderKind, type DocumentRecord } from '../domain/revision.ts';
import { normalizeForSearch } from './searchIndex.ts';

/**
 * Inicio (plan 11): todos los documentos en un solo sitio, al estilo de «Mi unidad». Reglas puras
 * de qué se lista, en qué orden y adónde se puede mover cada cosa; la vista está en
 * `features/home/`. Las carpetas de «Notas» (`folder`) y de «Documentos» (`docfolder`) conviven:
 * en la raíz salen las dos, y dentro de cada una, lo suyo.
 */
export type HomeFilter = 'all' | 'notes' | 'canvases' | 'docs' | 'calendars' | 'folders';
export type HomeSort = 'modified' | 'name';

export const HOME_FILTERS: readonly HomeFilter[] = [
  'all',
  'notes',
  'canvases',
  'docs',
  'calendars',
  'folders',
];

/**
 * Lo que Inicio lista: ni la papelera, ni lo archivado, ni las plantillas (tienen su panel), ni los
 * entornos (tienen su propio bloque, plan 12).
 */
export function isHomeItem(doc: DocumentRecord): boolean {
  return !doc.deleted && !doc.archived && doc.kind !== 'template' && doc.kind !== 'workspace';
}

/** Entornos de trabajo vivos, por nombre (plan 12). */
export function homeWorkspaces(documents: readonly DocumentRecord[]): DocumentRecord[] {
  return documents
    .filter((d) => d.kind === 'workspace' && !d.deleted && !d.archived)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

/** Documentos que se pueden meter en un entorno: lo que Inicio lista, sin carpetas. */
export function canJoinWorkspace(doc: DocumentRecord): boolean {
  return isHomeItem(doc) && !isFolderKind(doc.kind);
}

function matchesFilter(doc: DocumentRecord, filter: HomeFilter): boolean {
  switch (filter) {
    case 'notes':
      return doc.kind === 'note';
    case 'canvases':
      return doc.kind === 'canvas';
    case 'docs':
      return doc.kind === 'doc' || doc.kind === 'mddoc';
    case 'calendars':
      return doc.kind === 'calendar';
    case 'folders':
      return isFolderKind(doc.kind);
    default:
      return true;
  }
}

/**
 * Elementos de una carpeta de Inicio (null = la raíz): primero las carpetas, después lo demás,
 * por fecha de modificación (lo último arriba) o por nombre. Con búsqueda, se busca en todo el
 * almacén por título, sin carpetas. Lo que está en una carpeta borrada se ve en la raíz.
 */
export function homeItems(
  documents: readonly DocumentRecord[],
  options: { folderId: string | null; query: string; filter: HomeFilter; sort: HomeSort },
): DocumentRecord[] {
  const visible = documents.filter(isHomeItem);
  const folders = new Map(documents.filter((d) => isFolderKind(d.kind)).map((d) => [d.id, d]));
  const needle = normalizeForSearch(options.query.trim());
  const listed = needle
    ? visible.filter((d) => normalizeForSearch(d.title).includes(needle))
    : visible.filter((d) => {
        const folder = effectiveFolder(d, folders);
        return options.folderId
          ? folder === options.folderId
          : folder === null || !folders.has(folder);
      });
  const compare =
    options.sort === 'name'
      ? (a: DocumentRecord, b: DocumentRecord) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
      : (a: DocumentRecord, b: DocumentRecord) => b.updatedAt.localeCompare(a.updatedAt);
  return listed
    .filter((d) => matchesFilter(d, options.filter))
    .sort((a, b) => Number(isFolderKind(b.kind)) - Number(isFolderKind(a.kind)) || compare(a, b));
}

/**
 * Miembros de un entorno (plan 12.2) que siguen vivos, con la misma búsqueda, filtro y orden que
 * una carpeta (los que se borraron o archivaron no salen).
 */
export function workspaceItems(
  documents: readonly DocumentRecord[],
  members: readonly string[],
  options: { query: string; filter: HomeFilter; sort: HomeSort },
): DocumentRecord[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const needle = normalizeForSearch(options.query.trim());
  const list = members
    .map((id) => byId.get(id))
    .filter((d): d is DocumentRecord => !!d && isHomeItem(d))
    .filter((d) => !needle || normalizeForSearch(d.title).includes(needle))
    .filter((d) => matchesFilter(d, options.filter));
  return options.sort === 'name'
    ? list.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
      )
    : list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Lo modificado más recientemente (sin carpetas ni calendarios): el bloque «Recientes». */
export function homeRecent(documents: readonly DocumentRecord[], count: number): DocumentRecord[] {
  return documents
    .filter((d) => isHomeItem(d) && !isFolderKind(d.kind) && d.kind !== 'calendar')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, count);
}

/**
 * Carpetas a las que se pueden mover todos los elementos elegidos: las del tipo de carpeta que les
 * corresponde (todas del mismo), sin crear ciclos. null si la selección mezcla «Notas» con
 * «Documentos», o tiene algo que no va en carpetas (un calendario): entonces no se puede mover.
 */
export function moveTargets(
  documents: readonly DocumentRecord[],
  selected: readonly DocumentRecord[],
): DocumentRecord[] | null {
  const kinds = new Set(selected.map((d) => folderKindFor(d.kind)));
  const [folderKind] = [...kinds];
  if (kinds.size !== 1 || !folderKind) return null;
  return documents
    .filter((d) => d.kind === folderKind && isHomeItem(d))
    .filter((f) => selected.every((s) => s.id !== f.id && !wouldCreateCycle(documents, s.id, f.id)))
    .sort((a, b) => a.title.localeCompare(b.title));
}
