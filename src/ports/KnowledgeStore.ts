import type { Uuid } from '../domain/ids.ts';
import type { RevisionKind } from '../domain/revision.ts';

/**
 * Índices derivados de enlaces y búsqueda (diseño §6 y §10). Se reconstruyen desde las revisiones
 * activas; si se pierden o fallan, el contenido no se ve afectado.
 */
export interface StoredLink {
  sourceDocumentId: Uuid;
  sourceElementId: string | null;
  targetDocumentId: Uuid | null;
  targetElementId: string | null;
  kind: 'markdown' | 'wiki' | 'element';
  label: string;
}

export interface SearchDocument {
  documentId: Uuid;
  /** Revisión de la que se derivó; si difiere de la cabeza, hay que volver a indexar. */
  revisionId: Uuid;
  kind: RevisionKind;
  title: string;
  tags: string[];
  text: string;
  elements: Array<{ elementId: string; text: string }>;
}

export interface KnowledgeStore {
  /** Revisión indexada de cada documento (para detectar índices desactualizados). */
  indexedRevisions(): Promise<Map<Uuid, Uuid>>;
  replaceDerived(documentId: Uuid, links: StoredLink[], search: SearchDocument): Promise<void>;
  removeDerived(documentId: Uuid): Promise<void>;
  linksTo(documentId: Uuid): Promise<StoredLink[]>;
  linksFrom(documentId: Uuid): Promise<StoredLink[]>;
  allLinks(): Promise<StoredLink[]>;
  allSearchDocuments(): Promise<SearchDocument[]>;
  getSearchDocument(documentId: Uuid): Promise<SearchDocument | undefined>;
}
