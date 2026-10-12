import { z } from 'zod';
import type { Uuid } from './ids.ts';

/** Contrato de revisión (diseño §5). Instantánea inmutable; createdAt es informativo. */
export const REVISION_SCHEMA_VERSION = 1 as const;

export const documentKindSchema = z.enum(['note', 'canvas']);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const revisionKindSchema = z.enum(['note', 'canvas', 'folder']);
export type RevisionKind = z.infer<typeof revisionKindSchema>;

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

export type Revision = z.infer<typeof revisionSchema>;
export type RevisionMetadata = Revision['metadata'];
export type ContentRefs = Revision['contentRefs'];

/** Proyección del documento: título y cabezas vigentes. Dos cabezas indican conflicto. */
export interface DocumentRecord {
  id: Uuid;
  kind: DocumentKind;
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
