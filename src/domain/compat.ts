import { REVISION_SCHEMA_VERSION, revisionEnvelopeSchema, revisionSchema } from './revision.ts';
import { canvasExtensionsSchema, type CanvasExtensions } from './sidecar.ts';

/**
 * Compatibilidad de versiones al leer (diseño §5 y §14.4): una versión desconocida se abre en
 * solo lectura con aviso; nunca se descarta contenido desconocido al guardar.
 */
export type ReadOnlyReason =
  /** Revisión, frontmatter, sidecar o escena con una versión posterior a la soportada. */
  | 'unsupported-version'
  /** El archivo no cumple el esquema de su versión. */
  | 'invalid-content';

export const SUPPORTED = {
  revision: REVISION_SCHEMA_VERSION,
  noteFrontmatter: 1,
  canvasExtensions: 1,
  calendar: 1,
  /** Versión del formato de escena .excalidraw que entiende el motor fijado (0.18). */
  excalidrawScene: 2,
} as const;

function versionOf(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null || !(key in value)) return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : null;
}

export function checkRevision(value: unknown): ReadOnlyReason | null {
  const version = versionOf(value, 'schemaVersion');
  if (version !== null && version > SUPPORTED.revision) {
    // Posterior, pero con el sobre que necesitan el motor y el almacén local; si no, inválida.
    return revisionEnvelopeSchema.safeParse(value).success
      ? 'unsupported-version'
      : 'invalid-content';
  }
  return revisionSchema.safeParse(value).success ? null : 'invalid-content';
}

export function checkNoteFrontmatterVersion(
  schemaVersion: number | undefined,
): ReadOnlyReason | null {
  return schemaVersion !== undefined && schemaVersion > SUPPORTED.noteFrontmatter
    ? 'unsupported-version'
    : null;
}

export function parseCanvasExtensions(
  value: unknown,
):
  | { extensions: CanvasExtensions; readOnly: null }
  | { extensions: null; readOnly: ReadOnlyReason } {
  const version = versionOf(value, 'schemaVersion');
  if (version !== null && version > SUPPORTED.canvasExtensions) {
    return { extensions: null, readOnly: 'unsupported-version' };
  }
  const parsed = canvasExtensionsSchema.safeParse(value);
  return parsed.success
    ? { extensions: parsed.data, readOnly: null }
    : { extensions: null, readOnly: 'invalid-content' };
}

export function checkSceneVersion(sceneJson: string | null): ReadOnlyReason | null {
  if (sceneJson === null) return null;
  let scene: unknown;
  try {
    scene = JSON.parse(sceneJson);
  } catch {
    return 'invalid-content';
  }
  const version = versionOf(scene, 'version');
  return version !== null && version > SUPPORTED.excalidrawScene ? 'unsupported-version' : null;
}

/** El primer motivo de solo lectura encontrado, o null si todo es compatible. */
export function firstReason(...reasons: Array<ReadOnlyReason | null>): ReadOnlyReason | null {
  return reasons.find((r) => r !== null) ?? null;
}
