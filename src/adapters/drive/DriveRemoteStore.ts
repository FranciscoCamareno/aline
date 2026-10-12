import type { DocumentRecord, Revision } from '../../domain/revision.ts';
import { vaultSchema, type Vault, type VersionPrune } from '../../domain/vault.ts';
import {
  assetPath,
  indexFiles,
  jsonBytes,
  mimeForPath,
  objectPath,
  VAULT_README,
} from '../../application/vaultFormat.ts';
import {
  RemoteError,
  type ReadableCopy,
  type RemoteChangePage,
  type RemoteObject,
  type RemoteStore,
} from '../../ports/RemoteStore.ts';
import { utf8Decode, utf8Encode } from '../../shared/hash.ts';
import { FOLDER_MIME, hasProperty, quote, type DriveClient, type DriveFile } from './driveApi.ts';

/**
 * Tipos de archivo del almacén en Drive (`appProperties.mindnote`). Todo se busca por
 * propiedades (vaultId + id/hash), nunca por ruta: dos carpetas `revisions` creadas a la vez por
 * dos equipos no rompen nada, solo duplican un contenedor.
 */
type Kind =
  'vault' | 'vault-json' | 'dir' | 'revision' | 'object' | 'control' | 'readable' | 'index';

/** Además del feed de cambios, cada cierto tiempo se relista todo (reintenta lo rechazado). */
const FULL_LISTING_MS = 10 * 60_000;

export interface DriveVaultEntry {
  folderId: string;
  folderName: string;
  vault: Vault;
}

const notTrashed = 'trashed = false';

function props(kind: Kind, vaultId: string, extra: Record<string, string> = {}) {
  return { mindnote: kind, vaultId, ...extra };
}

function where(kind: Kind, vaultId: string, extra: Record<string, string> = {}): string {
  return [
    hasProperty('mindnote', kind),
    hasProperty('vaultId', vaultId),
    ...Object.entries(extra).map(([k, v]) => hasProperty(k, v)),
    notTrashed,
  ].join(' and ');
}

export function driveFolderName(vault: Vault): string {
  return `Aline - ${vault.name}`;
}

/** Almacenes que esta aplicación creó en el Drive de la cuenta autorizada (drive.file). */
export async function listDriveVaults(client: DriveClient): Promise<DriveVaultEntry[]> {
  const roots = await client.list(
    `${hasProperty('mindnote', 'vault')} and mimeType = ${quote(FOLDER_MIME)} and ${notTrashed}`,
  );
  const out: DriveVaultEntry[] = [];
  for (const root of roots) {
    const vault = await new DriveRemoteStore(client, root.id).readVault();
    if (vault) out.push({ folderId: root.id, folderName: root.name, vault });
  }
  return out;
}

/** Crea la carpeta raíz de un almacén en «Mi unidad» y escribe vault.json. */
export async function createDriveVault(
  client: DriveClient,
  vault: Vault,
): Promise<DriveVaultEntry> {
  const root = await client.createFolder(driveFolderName(vault), null, props('vault', vault.id));
  await new DriveRemoteStore(client, root.id).initializeVault(vault);
  return { folderId: root.id, folderName: root.name, vault };
}

/**
 * Google Drive como almacén remoto (plan 4.5, diseño §8.2). Mismo contrato y mismo formato
 * abierto que la carpeta local: objetos primero, revisión al final; ningún objeto, revisión ni
 * control se reescribe (si ya existe con esas propiedades, no se vuelve a subir). Solo los
 * índices aceleradores se actualizan en su sitio.
 */
export class DriveRemoteStore implements RemoteStore {
  private readonly client: DriveClient;
  private readonly rootId: string;
  private vaultId: string | null = null;
  private readonly dirs = new Map<string, Promise<string>>();
  /** revisionId → fileId de la última lista completa (evita una búsqueda por revisión). */
  private revisionFiles = new Map<string, string>();
  private readonly controlCache = new Map<string, VersionPrune | null>();
  private lastFullListing = 0;
  private readonly now: () => number;

  constructor(client: DriveClient, rootId: string, now: () => number = Date.now) {
    this.client = client;
    this.rootId = rootId;
    this.now = now;
  }

  async readVault(): Promise<Vault | null> {
    const [file] = await this.client.list(
      `${quote(this.rootId)} in parents and name = 'vault.json' and ${notTrashed}`,
    );
    if (!file) return null;
    let parsed;
    try {
      parsed = vaultSchema.safeParse(JSON.parse(utf8Decode(await this.client.download(file.id))));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) throw new RemoteError('not-found', 'vault.json no es válido');
    this.vaultId = parsed.data.id;
    return parsed.data;
  }

  async initializeVault(vault: Vault): Promise<void> {
    const existing = await this.readVault();
    if (existing && existing.id !== vault.id) {
      throw new RemoteError('permission', 'La carpeta de Drive ya contiene otro almacén');
    }
    this.vaultId = vault.id;
    if (!existing) {
      await this.client.createFile(
        {
          name: 'vault.json',
          parents: [this.rootId],
          mimeType: 'application/json',
          appProperties: props('vault-json', vault.id),
        },
        jsonBytes(vault),
      );
    }
    const readme = await this.client.list(
      `${quote(this.rootId)} in parents and name = 'README.md' and ${notTrashed}`,
    );
    if (!readme.length) {
      await this.client.createFile(
        {
          name: 'README.md',
          parents: [this.rootId],
          mimeType: 'text/markdown',
          appProperties: props('index', vault.id, { path: 'README.md' }),
        },
        utf8Encode(VAULT_README),
      );
    }
  }

  /**
   * El cursor es un startPageToken de Drive, tomado ANTES de listar para no perder cambios
   * concurrentes ([S14]). Con cursor, el feed dice si algo de este almacén cambió; si nada
   * cambió se evita relistar. Un cursor inválido provoca una reconciliación completa.
   */
  async pull(cursor: string | null): Promise<RemoteChangePage> {
    const vaultId = await this.requireVaultId();
    let token: string;
    let relevant = true;
    if (cursor) {
      try {
        const feed = await this.client.changes(cursor);
        token = feed.newStartPageToken;
        relevant = feed.changes.some(
          // Los índices (también los propios) son derivados: no obligan a relistar.
          (c) =>
            c.removed ||
            (c.file?.appProperties?.['vaultId'] === vaultId &&
              c.file.appProperties['mindnote'] !== 'index'),
        );
      } catch (error) {
        if (!(error instanceof RemoteError) || !['not-found', 'permission'].includes(error.kind)) {
          throw error;
        }
        token = await this.client.startPageToken();
      }
    } else {
      token = await this.client.startPageToken();
    }
    if (!relevant && this.now() - this.lastFullListing < FULL_LISTING_MS) {
      return { revisionIds: [], controls: [], nextCursor: token, complete: true };
    }

    const revisions = await this.client.list(where('revision', vaultId));
    this.revisionFiles = new Map();
    for (const file of revisions) {
      const id = file.appProperties?.['revisionId'];
      if (id && !this.revisionFiles.has(id)) this.revisionFiles.set(id, file.id);
    }
    const controls: VersionPrune[] = [];
    for (const file of await this.client.list(where('control', vaultId))) {
      if (!this.controlCache.has(file.id)) {
        try {
          this.controlCache.set(
            file.id,
            JSON.parse(utf8Decode(await this.client.download(file.id))) as VersionPrune,
          );
        } catch (error) {
          if (error instanceof RemoteError) throw error;
          this.controlCache.set(file.id, null); // ilegible: el motor valida los que sí se leen
        }
      }
      const control = this.controlCache.get(file.id);
      if (control) controls.push(control);
    }
    this.lastFullListing = this.now();
    return {
      revisionIds: [...this.revisionFiles.keys()],
      controls,
      nextCursor: token,
      complete: true,
    };
  }

  async getRevision(id: string): Promise<unknown> {
    const fileId =
      this.revisionFiles.get(id) ??
      (
        await this.client.list(where('revision', await this.requireVaultId(), { revisionId: id }))
      )[0]?.id;
    if (!fileId) return null;
    try {
      return JSON.parse(utf8Decode(await this.client.download(fileId)));
    } catch (error) {
      if (error instanceof RemoteError && error.kind !== 'not-found') throw error;
      return null;
    }
  }

  async getObject(hash: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const [file] = await this.client.list(where('object', await this.requireVaultId(), { hash }));
    if (!file) return null;
    try {
      return { bytes: await this.client.download(file.id), mimeType: file.mimeType };
    } catch (error) {
      if (error instanceof RemoteError && error.kind === 'not-found') return null;
      throw error;
    }
  }

  async putObject(object: RemoteObject, operationId: string): Promise<void> {
    const vaultId = await this.requireVaultId();
    // Idempotente: una respuesta perdida no duplica el objeto en el siguiente intento.
    if ((await this.client.list(where('object', vaultId, { hash: object.hash }))).length) return;
    const path =
      object.role === 'asset'
        ? assetPath({ hash: object.hash, mimeType: object.mimeType })
        : objectPath(object.hash, object.role);
    const [folder, name] = path.split('/') as [string, string];
    await this.client.createFile(
      {
        name,
        parents: [await this.dir(folder)],
        mimeType: object.mimeType || mimeForPath(name),
        appProperties: props('object', vaultId, { hash: object.hash, operationId }),
      },
      object.bytes,
    );
  }

  async publishRevision(revision: Revision, operationId: string): Promise<void> {
    const vaultId = await this.requireVaultId();
    if ((await this.client.list(where('revision', vaultId, { revisionId: revision.id }))).length) {
      return;
    }
    // Copia legible por versión (§8.3), antes de la revisión, como en la carpeta.
    if (revision.metadata.kind === 'note' && revision.contentRefs.body) {
      const existing = await this.client.list(
        where('readable', vaultId, { revisionId: revision.id }),
      );
      const body = existing.length ? null : await this.getObject(revision.contentRefs.body);
      if (body) {
        await this.client.createFile(
          {
            name: `${revision.id}.md`,
            parents: [await this.dir(`readable/${revision.documentId}`)],
            mimeType: 'text/markdown',
            appProperties: props('readable', vaultId, {
              documentId: revision.documentId,
              revisionId: revision.id,
            }),
          },
          body.bytes,
        );
      }
    }
    const file = await this.client.createFile(
      {
        name: `${revision.id}.json`,
        parents: [await this.dir('revisions')],
        mimeType: 'application/json',
        appProperties: props('revision', vaultId, {
          revisionId: revision.id,
          documentId: revision.documentId,
          operationId,
        }),
      },
      jsonBytes(revision),
    );
    this.revisionFiles.set(revision.id, file.id);
  }

  async publishControl(control: VersionPrune): Promise<void> {
    const vaultId = await this.requireVaultId();
    if ((await this.client.list(where('control', vaultId, { controlId: control.id }))).length) {
      return;
    }
    await this.client.createFile(
      {
        name: `${control.id}.json`,
        parents: [await this.dir('controls')],
        mimeType: 'application/json',
        appProperties: props('control', vaultId, { controlId: control.id }),
      },
      jsonBytes(control),
    );
  }

  /** Los índices sí se reescriben: son derivados y no son autoridad (§6). */
  async publishIndexes(deviceId: string, documents: DocumentRecord[], vault: Vault): Promise<void> {
    const vaultId = await this.requireVaultId();
    for (const [path, bytes] of indexFiles(deviceId, documents, vault, new Date().toISOString())) {
      const [existing] = await this.client.list(where('index', vaultId, { path }));
      if (existing) {
        await this.client.updateMedia(existing.id, bytes, 'application/json');
        continue;
      }
      const parts = path.split('/');
      await this.client.createFile(
        {
          name: parts.at(-1)!,
          parents: [parts.length > 1 ? await this.dir(parts[0]!) : this.rootId],
          mimeType: 'application/json',
          appProperties: props('index', vaultId, { path }),
        },
        bytes,
      );
    }
  }

  /**
   * Copias legibles. Con drive.file solo se ven archivos creados por esta aplicación; una
   * edición que conserve el archivo (p. ej. Google Drive para ordenador) cambia modifiedTime.
   */
  async listReadableCopies(): Promise<ReadableCopy[]> {
    const files = await this.client.list(where('readable', await this.requireVaultId()));
    return files.flatMap((file: DriveFile) => {
      const documentId = file.appProperties?.['documentId'];
      const revisionId = file.appProperties?.['revisionId'];
      if (!documentId || !revisionId) return [];
      return [
        {
          documentId,
          revisionId,
          path: `readable/${documentId}/${revisionId}.md`,
          lastModified: file.modifiedTime ? Date.parse(file.modifiedTime) : 0,
          read: () => this.client.download(file.id),
        },
      ];
    });
  }

  private async requireVaultId(): Promise<string> {
    if (this.vaultId) return this.vaultId;
    const vault = await this.readVault();
    if (!vault) throw new RemoteError('not-found', 'La carpeta de Drive no contiene un almacén');
    return vault.id;
  }

  /** Busca o crea una subcarpeta (`revisions`, `readable/<doc>`…); se memoriza por sesión. */
  private dir(path: string): Promise<string> {
    let pending = this.dirs.get(path);
    if (!pending) {
      pending = this.findOrCreateDir(path);
      this.dirs.set(path, pending);
      pending.catch(() => this.dirs.delete(path));
    }
    return pending;
  }

  private async findOrCreateDir(path: string): Promise<string> {
    const vaultId = await this.requireVaultId();
    const [found] = await this.client.list(where('dir', vaultId, { path }));
    if (found) return found.id;
    const parts = path.split('/');
    const parent = parts.length > 1 ? await this.dir(parts.slice(0, -1).join('/')) : this.rootId;
    return (await this.client.createFolder(parts.at(-1)!, parent, props('dir', vaultId, { path })))
      .id;
  }
}
