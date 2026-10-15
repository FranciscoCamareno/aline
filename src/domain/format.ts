import { z } from 'zod';
import { revisionKindSchema, revisionSchema } from './revision.ts';
import { calendarSchema } from './calendar.ts';
import { encryptionFileSchema } from './encryption.ts';
import { canvasExtensionsSchema } from './sidecar.ts';
import { vaultSchema, versionPruneSchema } from './vault.ts';

/**
 * Esquemas de los archivos JSON del formato abierto v1 (diseño §6, RNF-09). Son la fuente de
 * los JSON Schema publicados en docs/formato/schemas/v1 (`node scripts/export-schemas.ts`).
 */
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** `heads/<deviceId>.json`: índice acelerador de cabezas, reconstruible desde las revisiones. */
export const headsFileSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: z.uuid(),
  generatedAt: z.iso.datetime(),
  heads: z.record(z.uuid(), z.array(z.uuid())),
});

/** `catalog.json`: catálogo derivado de títulos y cabezas; nunca decide qué cambio gana. */
export const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  vaultId: z.uuid(),
  deviceId: z.uuid(),
  generatedAt: z.iso.datetime(),
  documents: z.array(
    z.object({
      id: z.uuid(),
      kind: revisionKindSchema,
      title: z.string(),
      folderId: z.uuid().nullable(),
      tags: z.array(z.string()),
      deleted: z.boolean(),
      headRevisionIds: z.array(z.uuid()),
    }),
  ),
});

/** `backup-manifest.json` de la copia completa (diseño §12.2). */
export const backupManifestSchema = z.object({
  schemaVersion: z.literal(1),
  vaultId: z.uuid(),
  formatVersion: z.literal(1),
  createdAt: z.iso.datetime(),
  appVersion: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      bytes: z.number().int().nonnegative(),
      sha256,
    }),
  ),
});

export const FORMAT_SCHEMAS = {
  vault: vaultSchema,
  revision: revisionSchema,
  'canvas-extensions': canvasExtensionsSchema,
  calendar: calendarSchema,
  heads: headsFileSchema,
  catalog: catalogSchema,
  'version-prune': versionPruneSchema,
  'backup-manifest': backupManifestSchema,
  encryption: encryptionFileSchema,
} as const;

/** JSON Schema (draft 2020-12) de cada archivo del formato. */
export function formatJsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(FORMAT_SCHEMAS).map(([name, schema]) => [
      name,
      {
        $id: `https://mindnote.local/schemas/v1/${name}.schema.json`,
        ...z.toJSONSchema(schema, { target: 'draft-2020-12' }),
      },
    ]),
  );
}
