import type { RichNode } from './richDoc.ts';

/**
 * Imágenes de los documentos (fase 8.4, 17/10/2026): solo imágenes subidas, pegadas o
 * arrastradas desde el equipo, guardadas como archivos del almacén (`contentRefs.assets`,
 * direccionados por SHA-256) igual que las del lienzo. El documento las cita como
 * `mindnote-asset:<sha256>`; nunca se descarga una imagen remota (diseño §13).
 */
export const DOC_ASSET_PREFIX = 'mindnote-asset:';

/** Tipos de imagen admitidos (SVG no: puede llevar código). */
export const DOC_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
/** Tamaño máximo de una imagen. */
export const MAX_DOC_IMAGE_BYTES = 10 * 1024 * 1024;

const HASH = /^[0-9a-f]{64}$/;

/** Hash de una referencia `mindnote-asset:<sha256>`, o null si no lo es. */
export function assetHashOf(src: unknown): string | null {
  if (typeof src !== 'string' || !src.startsWith(DOC_ASSET_PREFIX)) return null;
  const hash = src.slice(DOC_ASSET_PREFIX.length);
  return HASH.test(hash) ? hash : null;
}

/** Imágenes que cita un documento Markdown (`![…](mindnote-asset:…)`), sin repetir y en orden. */
export function markdownAssetRefs(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/mindnote-asset:([0-9a-f]{64})/g)) found.add(match[1]!);
  return [...found].sort();
}

/** Imágenes que cita un documento con formato (nodos `image`), sin repetir y en orden. */
export function richDocAssetRefs(content: RichNode): string[] {
  const found = new Set<string>();
  const walk = (node: RichNode) => {
    if (node.type === 'image') {
      const hash = assetHashOf(node.attrs?.['src']);
      if (hash) found.add(hash);
    }
    node.content?.forEach(walk);
  };
  walk(content);
  return [...found].sort();
}

/** ¿Se puede insertar este archivo como imagen de un documento? */
export function acceptableDocImage(file: { type: string; size: number }): boolean {
  return (
    (DOC_IMAGE_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_DOC_IMAGE_BYTES
  );
}
