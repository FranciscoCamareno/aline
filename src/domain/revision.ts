import { z } from 'zod';
import type { Uuid } from './ids.ts';

/** Contrato de revisión (diseño §5). Instantánea inmutable; createdAt es informativo. */
export const REVISION_SCHEMA_VERSION = 1 as const;

export const documentKindSchema = z.enum(['note', 'canvas']);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/**
 * Tipos de documento del almacén. `calendar` (eventos, JSON) y `template` (plantilla del lienzo,
 * una escena .excalidraw con sus imágenes) se añadieron el 14/10/2026: ver el registro de
 * cambios de arquitectura en el diseño técnico. `doc` (documento de texto enriquecido, JSON de
 * Tiptap/ProseMirror) se añadió el 15/10/2026 con el mismo registro.
 */
export const revisionKindSchema = z.enum([
  'note',
  'canvas',
  'folder',
  'calendar',
  'template',
  'doc',
]);
export type RevisionKind = z.infer<typeof revisionKindSchema>;

/** Notas y lienzos: lo que se abre y se organiza en la biblioteca. */
export function isContentKind(kind: RevisionKind): kind is DocumentKind {
  return kind === 'note' || kind === 'canvas';
}

export const revisionOperationSchema = z.enum(['save', 'delete', 'restore', 'resolve', 'external']);
export type RevisionOperation = z.infer<typeof revisionOperationSchema>;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const revisionSchema = z.object({
  schemaVersion: z.literal(REVISION_SCHEMA_VERSION),
  id: z.uuid(),
  documentId: z.uuid(),
  parentIds: z.array(z.uuid()),
  deviceId: z.uuid(),
  createdAt: z.iso.datetime(),
  operation: revisionOperationSchema,
  metadata: z.object({
    kind: revisionKindSchema,
    title: z.string(),
    folderId: z.uuid().nullable(),
    tags: z.array(z.string()),
    deleted: z.boolean(),
  }),
  contentRefs: z.object({
    body: sha256Schema.nullable(),
    extensions: sha256Schema.nullable(),
    assets: z.array(sha256Schema),
  }),
});

/**
 * Sobre mínimo de una revisión con versión posterior a la soportada (auditoría 13/10/2026, H05):
 * se acepta para abrirla en solo lectura (§5), pero solo si los campos que usan el motor de
 * sincronización y el almacén local existen y tienen el tipo esperado. Los campos desconocidos
 * se conservan; los límites evitan que un archivo remoto pequeño dispare trabajo desmedido.
 */
export const revisionEnvelopeSchema = z.object({
  schemaVersion: z.number().int().min(1),
  id: z.uuid(),
  documentId: z.uuid(),
  parentIds: z.array(z.uuid()).max(1_000),
  deviceId: z.uuid(),
  createdAt: z.string(),
  operation: z.string(),
  metadata: z.looseObject({
    kind: revisionKindSchema,
    title: z.string(),
    folderId: z.uuid().nullable(),
    tags: z.array(z.string()).max(1_000),
    deleted: z.boolean(),
  }),
  contentRefs: z.looseObject({
    body: sha256Schema.nullable(),
    extensions: sha256Schema.nullable(),
    assets: z.array(sha256Schema).max(10_000),
  }),
});

export type Revision = z.infer<typeof revisionSchema>;
export type RevisionMetadata = Revision['metadata'];
export type ContentRefs = Revision['contentRefs'];

/** Proyección del documento: título y cabezas vigentes. Dos cabezas indican conflicto. */
export interface DocumentRecord {
  id: Uuid;
  /**
   * Nota, lienzo, carpeta, calendario, plantilla o documento; todos son revisionados (§5). Solo
   * notas y lienzos se abren en la biblioteca (`isContentKind`).
   */
  kind: RevisionKind;
  title: string;
  folderId: Uuid | null;
  tags: string[];
  deleted: boolean;
  headRevisionIds: Uuid[];
  /** Generación local que aumenta en cada commit; sirve para detectar escrituras concurrentes. */
  generation: number;
  createdAt: string;
  updatedAt: string;
}

export function hasConflict(doc: Pick<DocumentRecord, 'headRevisionIds'>): boolean {
  return doc.headRevisionIds.length > 1;
}

export function sameHeads(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
