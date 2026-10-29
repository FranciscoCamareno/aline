import { EVENT_COLORS, type EventColor } from './calendar.ts';
import type { ReadOnlyReason } from './compat.ts';
import { z } from './zod.ts';

/**
 * Entorno de trabajo (plan 12, desde el 28/10/2026): agrupa documentos para compartirlos juntos.
 * Es un documento más (`kind: 'workspace'`), con revisiones como todos; su cuerpo es este JSON
 * (formato §2.5.5). Un documento puede estar en varios entornos; quitarlo de uno no lo borra, y
 * borrar un entorno no borra sus documentos (nunca en cascada).
 */
export const WORKSPACE_SCHEMA_VERSION = 1;
export const MAX_WORKSPACE_MEMBERS = 10_000;

export const workspaceSchema = z.looseObject({
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  /** Color de su tarjeta (los de las notas adhesivas y el calendario). */
  color: z.enum(EVENT_COLORS),
  description: z.string().max(2000),
  /** Documentos del entorno, en orden; sin repetidos. */
  members: z.array(z.uuid()).max(MAX_WORKSPACE_MEMBERS),
});
export type WorkspaceData = z.infer<typeof workspaceSchema>;

export function emptyWorkspace(color: EventColor = 'agua'): WorkspaceData {
  return { schemaVersion: WORKSPACE_SCHEMA_VERSION, color, description: '', members: [] };
}

export function parseWorkspace(value: unknown): {
  workspace: WorkspaceData;
  readOnly: ReadOnlyReason | null;
} {
  const version =
    value && typeof value === 'object' ? (value as { schemaVersion?: unknown }).schemaVersion : 0;
  if (typeof version === 'number' && version > WORKSPACE_SCHEMA_VERSION) {
    const members = z.array(z.uuid()).safeParse((value as { members?: unknown }).members);
    return {
      workspace: { ...emptyWorkspace(), members: members.success ? members.data : [] },
      readOnly: 'unsupported-version',
    };
  }
  const parsed = workspaceSchema.safeParse(value);
  return parsed.success
    ? { workspace: { ...parsed.data, members: [...new Set(parsed.data.members)] }, readOnly: null }
    : { workspace: emptyWorkspace(), readOnly: 'invalid-content' };
}

/** Añade documentos al final (los que ya están, se quedan donde estaban). */
export function withMembers(workspace: WorkspaceData, ids: readonly string[]): WorkspaceData {
  const members = [...workspace.members];
  for (const id of ids) if (!members.includes(id)) members.push(id);
  return { ...workspace, members: members.slice(0, MAX_WORKSPACE_MEMBERS) };
}

export function withoutMembers(workspace: WorkspaceData, ids: readonly string[]): WorkspaceData {
  const drop = new Set(ids);
  return { ...workspace, members: workspace.members.filter((id) => !drop.has(id)) };
}

/**
 * Dos versiones a la vez de un entorno (dos dispositivos): se unen los miembros, en el orden de la
 * primera y después lo nuevo de la segunda. Lo demás (color, descripción), de la primera. Quitar
 * un documento en un lado y no en el otro lo deja dentro: perder un miembro sin querer es peor.
 */
export function mergeWorkspaces(a: WorkspaceData, b: WorkspaceData): WorkspaceData {
  return withMembers(a, b.members);
}
