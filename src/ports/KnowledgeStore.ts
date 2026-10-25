import type { TextBlock } from '../domain/anchors.ts';
import type { Uuid } from '../domain/ids.ts';
import type { TextSelector } from '../domain/links.ts';
import type { RevisionKind } from '../domain/revision.ts';

/**
 * Índices derivados de enlaces y búsqueda (diseño §6 y §10). Se reconstruyen desde las revisiones
 * activas; si se pierden o fallan, el contenido no se ve afectado.
 */
export interface StoredLink {
  sourceDocumentId: Uuid;
  /** Elemento del lienzo, evento del calendario o bloque anclado de origen. */
  sourceElementId: string | null;
  targetDocumentId: Uuid | null;
  targetElementId: string | null;
  /**
   * Ancla de destino (formato §2.3.1). Opcionales: las entradas indexadas antes del formato 2
   * del índice no las tienen (se reindexa todo al arrancar).
   */
  targetBlockId?: string | null;
  targetEventId?: string | null;
  targetQuote?: TextSelector | null;
  kind: 'markdown' | 'wiki' | 'element' | 'rich' | 'event';
  label: string;
  /** Frase de origen alrededor del enlace. */
  context?: string;
}

export interface SearchDocument {
  documentId: Uuid;
  /** Revisión de la que se derivó; si difiere de la cabeza, hay que volver a indexar. */
  revisionId: Uuid;
  kind: RevisionKind;
  title: string;
  tags: string[];
  /** En notas y documentos, el texto mostrado: sobre él se resuelven las citas de los enlaces. */
  text: string;
  elements: Array<{ elementId: string; text: string }>;
  /** Documentos con formato: bloques anclados dentro de `text`. */
  blocks?: TextBlock[];
  /** Lienzos: ids de los elementos vivos (desde el formato 3 del índice, plan 10.6). */
  elementIds?: string[];
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
  /** Formato con el que se construyeron los índices; si cambia, se reindexa todo. */
  indexFormat(): Promise<number>;
  setIndexFormat(format: number): Promise<void>;
}
