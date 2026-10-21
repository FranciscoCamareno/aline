import { z } from './zod.ts';
import type { Uuid } from './ids.ts';

/** Formato del almacén (diseño §6). Se versiona separado de la app y del esquema Excalidraw. */
export const VAULT_FORMAT_VERSION = 1 as const;

/** `vault.json`: identidad y versión del formato. */
export const vaultSchema = z.object({
  formatVersion: z.literal(VAULT_FORMAT_VERSION),
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export type Vault = z.infer<typeof vaultSchema>;

export interface DeviceState {
  deviceId: Uuid;
  localGeneration: number;
  /** Pendiente (sincronización): cursor del feed de cambios remoto. */
  syncCursor: string | null;
  /** Pendiente (sincronización): mapeo hash/revisión → ID de archivo remoto. */
  remoteFileMap: Record<string, string>;
}

/**
 * `controls/<id>.json`: orden explícita de retirada de versiones (diseño §7.2).
 * Contrato; la poda aún no está implementada.
 */
export const versionPruneSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  revisionIds: z.array(z.uuid()),
  deviceId: z.uuid(),
  createdAt: z.iso.datetime(),
});

export type VersionPrune = z.infer<typeof versionPruneSchema>;
