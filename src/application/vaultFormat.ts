import { checkRevision } from '../domain/compat.ts';
import { catalogSchema, headsFileSchema } from '../domain/format.ts';
import type { DocumentRecord, Revision } from '../domain/revision.ts';
import { vaultSchema, versionPruneSchema, type VersionPrune } from '../domain/vault.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../shared/hash.ts';
import type { StoredBlob, VaultContent } from '../ports/VaultRepository.ts';

/**
 * Serializador y lector del formato abierto v1 (diseño §6, docs/formato-almacen.md).
 * Es la pieza común de la copia ZIP, la carpeta local y Drive (plan 2.1).
 */
export type { VaultContent };

export type VaultFiles = Map<string, Uint8Array>;

export interface ReadProblem {
  path: string;
  /** Código estable para la interfaz y el diagnóstico. */
  code:
    | 'invalid-json'
    | 'invalid-schema'
    | 'unsupported-version'
    | 'hash-mismatch'
    | 'missing-object'
    | 'unknown-path'
    | 'pruned';
  detail?: string;
}

export interface ReadResult {
  content: VaultContent;
  problems: ReadProblem[];
}

const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'application/pdf': 'pdf',
};
const EXTENSION_MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MIME_EXTENSION).map(([mime, ext]) => [ext, mime])),
  md: 'text/markdown; charset=utf-8',
  excalidraw: 'application/vnd.excalidraw+json',
  json: 'application/json',
  bin: 'application/octet-stream',
};

const SHA256 = /^[0-9a-f]{64}$/;

/** Rutas que admite el formato; cualquier otra se ignora al leer (y se informa). */
export const FORMAT_PATHS = [
  /^vault\.json$/,
  /^README\.md$/,
  /^catalog\.json$/,
  /^backup-manifest\.json$/,
  /^revisions\/[0-9a-f-]{36}\.json$/,
  /^objects\/[0-9a-f]{64}\.(md|excalidraw|json)$/,
  /^assets\/[0-9a-f]{64}\.[a-z0-9]{1,10}$/,
  /^heads\/[0-9a-f-]{36}\.json$/,
  /^readable\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.md$/,
  /^controls\/[0-9a-f-]{36}\.json$/,
];

export function isFormatPath(path: string): boolean {
  return FORMAT_PATHS.some((re) => re.test(path));
}

function json(value: unknown): Uint8Array {
  return utf8Encode(`${JSON.stringify(value, null, 2)}\n`);
}

function objectPath(hash: string, role: 'note' | 'canvas' | 'extensions'): string {
  const ext = role === 'note' ? 'md' : role === 'canvas' ? 'excalidraw' : 'json';
  return `objects/${hash}.${ext}`;
}

function assetPath(blob: StoredBlob): string {
  const mime = blob.mimeType.split(';')[0]!.trim().toLowerCase();
  return `assets/${blob.hash}.${MIME_EXTENSION[mime] ?? 'bin'}`;
}

const VAULT_README = `# Almacén MindNote (formato abierto v1)

Este directorio se puede leer sin la aplicación. Especificación completa:
docs/formato-almacen.md en el repositorio de la aplicación.

- vault.json: identidad y versión del formato.
- revisions/<id>.json: cada versión de cada documento (inmutable).
- objects/<sha256>.md | .excalidraw | .json: contenido de notas, escenas y extensiones.
- assets/<sha256>.<ext>: imágenes y adjuntos.
- readable/<documento>/<revisión>.md: copia legible de cada versión de nota.
- heads/ y catalog.json: índices de ayuda; nunca deciden qué versión gana.

Versión vigente de un documento: la revisión que ninguna otra del mismo documento
incluye en «parentIds». Si hay varias, están en conflicto y todas se conservan.
En las escenas, «mindnote-asset:<sha256>» remite al archivo de assets/ con ese hash.
`;

/** Árbol de archivos del formato abierto para un contenido de almacén. */
export function vaultToFiles(
  content: VaultContent,
  { deviceId, now = new Date() }: { deviceId: string; now?: Date },
): VaultFiles {
  const files: VaultFiles = new Map();
  const generatedAt = now.toISOString();
  // Orden de claves canónico (el del esquema): mismos bytes en cada exportación.
  files.set('vault.json', json(vaultSchema.parse(content.vault)));
  files.set('README.md', utf8Encode(VAULT_README));

  for (const rev of content.revisions) {
    files.set(`revisions/${rev.id}.json`, json(rev));
    const { body, extensions, assets } = rev.contentRefs;
    const kind = rev.metadata.kind === 'note' ? 'note' : 'canvas';
    if (body) {
      const blob = content.blobs.get(body);
      if (blob) {
        files.set(objectPath(body, kind), blob.bytes);
        if (kind === 'note') files.set(`readable/${rev.documentId}/${rev.id}.md`, blob.bytes);
      }
    }
    if (extensions) {
      const blob = content.blobs.get(extensions);
      if (blob) files.set(objectPath(extensions, 'extensions'), blob.bytes);
    }
    for (const hash of assets) {
      const blob = content.blobs.get(hash);
      if (blob) files.set(assetPath(blob), blob.bytes);
    }
  }

  for (const control of content.controls) files.set(`controls/${control.id}.json`, json(control));

  files.set(
    `heads/${deviceId}.json`,
    json(
      headsFileSchema.parse({
        schemaVersion: 1,
        deviceId,
        generatedAt,
        heads: Object.fromEntries(content.documents.map((d) => [d.id, d.headRevisionIds])),
      }),
    ),
  );
  files.set(
    'catalog.json',
    json(
      catalogSchema.parse({
        schemaVersion: 1,
        vaultId: content.vault.id,
        deviceId,
        generatedAt,
        documents: content.documents.map((d) => ({
          id: d.id,
          kind: d.kind,
          title: d.title,
          folderId: d.folderId,
          tags: d.tags,
          deleted: d.deleted,
          headRevisionIds: d.headRevisionIds,
        })),
      }),
    ),
  );
  return files;
}

function parseJson(path: string, bytes: Uint8Array, problems: ReadProblem[]): unknown {
  try {
    return JSON.parse(utf8Decode(bytes));
  } catch {
    problems.push({ path, code: 'invalid-json' });
    return undefined;
  }
}

/**
 * Cabezas de cada documento a partir del grafo de revisiones (diseño §8.1): una revisión es
 * cabeza si ninguna otra del mismo documento la incluye en parentIds.
 */
export function deriveDocuments(revisions: Revision[]): DocumentRecord[] {
  const byDoc = new Map<string, Revision[]>();
  for (const rev of revisions) {
    const list = byDoc.get(rev.documentId) ?? [];
    list.push(rev);
    byDoc.set(rev.documentId, list);
  }
  const documents: DocumentRecord[] = [];
  for (const [id, revs] of byDoc) {
    const referenced = new Set(revs.flatMap((r) => r.parentIds));
    const sorted = [...revs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const heads = sorted.filter((r) => !referenced.has(r.id));
    const latest = heads.at(-1) ?? sorted.at(-1)!;
    const kind = latest.metadata.kind === 'note' ? 'note' : 'canvas';
    documents.push({
      id,
      kind,
      title: latest.metadata.title,
      folderId: latest.metadata.folderId,
      tags: latest.metadata.tags,
      deleted: latest.metadata.deleted,
      headRevisionIds: heads.map((r) => r.id),
      generation: revs.length,
      createdAt: sorted[0]!.createdAt,
      updatedAt: sorted.at(-1)!.createdAt,
    });
  }
  return documents;
}

/**
 * Lee un árbol del formato abierto. Nunca activa una revisión con objetos ausentes o con hash
 * incorrecto (diseño §7.1, paso 6); conserva las de versión posterior para abrirlas en solo
 * lectura y descarta las retiradas por controles explícitos.
 */
export async function filesToVault(files: VaultFiles): Promise<ReadResult> {
  const problems: ReadProblem[] = [];
  const vaultBytes = files.get('vault.json');
  if (!vaultBytes) throw new Error('Falta vault.json');
  const vaultParsed = vaultSchema.safeParse(parseJson('vault.json', vaultBytes, problems));
  if (!vaultParsed.success) throw new Error('vault.json no es válido o su versión no es la 1');

  const blobs = new Map<string, StoredBlob>();
  const revisions: Revision[] = [];
  const controls: VersionPrune[] = [];

  for (const [path, bytes] of files) {
    if (!isFormatPath(path)) {
      problems.push({ path, code: 'unknown-path' });
      continue;
    }
    const blobMatch = /^(objects|assets)\/([0-9a-f]{64})\.([a-z0-9]+)$/.exec(path);
    if (blobMatch) {
      const [, , hash, ext] = blobMatch;
      if ((await sha256Hex(bytes)) !== hash) {
        problems.push({ path, code: 'hash-mismatch' });
        continue;
      }
      blobs.set(hash!, {
        hash: hash!,
        mimeType: EXTENSION_MIME[ext!] ?? 'application/octet-stream',
        byteLength: bytes.byteLength,
        bytes,
      });
      continue;
    }
    if (path.startsWith('revisions/')) {
      const value = parseJson(path, bytes, problems);
      if (value === undefined) continue;
      const reason = checkRevision(value);
      if (reason === 'invalid-content') {
        problems.push({ path, code: 'invalid-schema' });
        continue;
      }
      if (reason === 'unsupported-version') {
        // Se conserva: la aplicación la abrirá en solo lectura.
        problems.push({ path, code: 'unsupported-version' });
      }
      revisions.push(value as Revision);
      continue;
    }
    if (path.startsWith('controls/')) {
      const parsed = versionPruneSchema.safeParse(parseJson(path, bytes, problems));
      if (parsed.success) controls.push(parsed.data);
      else problems.push({ path, code: 'invalid-schema' });
    }
  }

  const pruned = new Set(controls.flatMap((c) => c.revisionIds));
  const active = revisions.filter((rev) => {
    if (pruned.has(rev.id)) {
      problems.push({ path: `revisions/${rev.id}.json`, code: 'pruned' });
      return false;
    }
    const refs = [
      rev.contentRefs?.body,
      rev.contentRefs?.extensions,
      ...(rev.contentRefs?.assets ?? []),
    ];
    const missing = refs.filter(
      (h): h is string => typeof h === 'string' && SHA256.test(h) && !blobs.has(h),
    );
    if (missing.length) {
      problems.push({
        path: `revisions/${rev.id}.json`,
        code: 'missing-object',
        detail: missing.join(','),
      });
      return false;
    }
    return true;
  });

  return {
    content: {
      vault: vaultParsed.data,
      documents: deriveDocuments(active),
      revisions: active,
      blobs,
      controls,
    },
    problems,
  };
}
