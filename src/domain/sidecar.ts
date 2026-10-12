import { z } from 'zod';

/**
 * Sidecar de extensiones propias del lienzo (diseño §5 y §9). Es la autoridad para enlaces,
 * ramas e incrustaciones; customData del motor nunca es el único ejemplar.
 * En esta entrega se crea vacío y se conserva; las funciones que lo usan están pendientes.
 */
export const canvasExtensionsSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.uuid(),
  elementLinks: z.record(
    z.string(),
    z.object({ documentId: z.uuid(), elementId: z.string().nullable() }),
  ),
  mindMap: z.object({
    parentByNode: z.record(z.string(), z.string()),
    collapsedNodeIds: z.array(z.string()),
  }),
  noteEmbeds: z.array(z.unknown()),
  danglingConnectorIds: z.array(z.string()),
});

export type CanvasExtensions = z.infer<typeof canvasExtensionsSchema>;

export function emptyCanvasExtensions(documentId: string): CanvasExtensions {
  return {
    schemaVersion: 1,
    documentId,
    elementLinks: {},
    mindMap: { parentByNode: {}, collapsedNodeIds: [] },
    noteEmbeds: [],
    danglingConnectorIds: [],
  };
}
