import { z } from './zod.ts';

/**
 * Sidecar de extensiones propias del lienzo (diseño §5 y §9). Es la autoridad para enlaces,
 * ramas e incrustaciones; customData del motor nunca es el único ejemplar.
 */
export const canvasExtensionsSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.uuid(),
  elementLinks: z.record(
    z.string(),
    z.object({
      documentId: z.uuid(),
      elementId: z.string().nullable(),
      /**
       * Ancla de destino que no es un elemento (bloque, evento o cita), como el fragmento del
       * enlace sin `#` (formato §2.3.1). Opcional: desde el 16/10/2026.
       */
      fragment: z.string().max(4000).optional(),
    }),
  ),
  mindMap: z.object({
    parentByNode: z.record(z.string(), z.string()),
    collapsedNodeIds: z.array(z.string()),
    /**
     * Desde el 20/10/2026 (plan 9.23): opacidad y bloqueo originales de cada elemento oculto por
     * una rama plegada (en la escena quedan con opacidad 0 y bloqueados), para restaurarlos al
     * desplegar. Opcional: sin ramas plegadas no está.
     */
    hidden: z
      .record(z.string(), z.object({ opacity: z.number().min(0).max(100), locked: z.boolean() }))
      .optional(),
    /** Contador «+N» de cada nodo plegado: id del texto generado que lo muestra. Opcional. */
    badges: z.record(z.string(), z.string()).optional(),
  }),
  noteEmbeds: z.array(z.unknown()),
  danglingConnectorIds: z.array(z.string()),
  /**
   * Desde el 24/10/2026 (plan 10.9): estilo del fondo del lienzo (`domain/canvasBackground.ts`).
   * Opcional: sin la clave, liso. Un patrón desconocido se muestra liso y se conserva.
   */
  background: z.object({ pattern: z.string().max(32) }).optional(),
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
