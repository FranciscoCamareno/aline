import { isMarkdownKind, type DocumentRecord, type Revision } from '../../domain/revision.ts';
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
  type WrittenCopy,
} from '../../ports/RemoteStore.ts';
import { utf8Decode, utf8Encode } from '../../shared/hash.ts';

/**
 * Subconjunto de File System Access que usa el adaptador (diseño §7.1, §8.4, [S5]). Lo cumplen
 * FileSystemDirectoryHandle (carpeta elegida o OPFS) y el directorio en memoria de las pruebas.
 */
export interface FileLike {
  readonly lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<FileLike>;
  createWritable(): Promise<WritableLike>;
}
export interface DirHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  values(): AsyncIterable<DirHandleLike | FileHandleLike>;
}

const isNotFound = (error: unknown) =>
  error instanceof Error && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');

function classify(error: unknown): never {
  if (error instanceof RemoteError) throw error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    throw new RemoteError('permission', 'folder-permission', name);
  }
  if (name === 'QuotaExceededError') throw new RemoteError('quota', 'folder-full');
  if (name === 'NotFoundError') {
    throw new RemoteError('not-found', 'folder-unavailable');
  }
  throw new RemoteError(
    'transient',
    'folder-io',
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Carpeta local como almacén remoto (plan 4.2). Escribe el formato abierto: objetos primero y
 * revisión al final; ningún archivo de objetos ni de revisiones se sobrescribe. createWritable
 * protege cada archivo, no un conjunto: por eso el lector ignora revisiones con objetos ausentes.
 */
export class FolderRemoteStore implements RemoteStore {
  private readonly root: DirHandleLike;
  /**
   * hash → nombre de archivo (objetos y assets), para leer sin conocer la extensión. Se guarda
   * la promesa: el motor lee varios objetos a la vez y todos deben esperar al mismo listado
   * completo (con un mapa a medio llenar, un objeto existente parecería ausente).
   */
  private objectNames: Promise<Map<string, string>> | null = null;

  constructor(root: DirHandleLike) {
    this.root = root;
  }

  get name(): string {
    return this.root.name;
  }

  async readVault(): Promise<Vault | null> {
    try {
      const bytes = await this.read(this.root, 'vault.json');
      if (!bytes) return null;
      const parsed = vaultSchema.safeParse(JSON.parse(utf8Decode(bytes)));
      if (!parsed.success) throw new RemoteError('not-found', 'vault-invalid');
      return parsed.data;
    } catch (error) {
      return classify(error);
    }
  }

  async initializeVault(vault: Vault): Promise<void> {
    try {
      const existing = await this.readVault();
      if (existing && existing.id !== vault.id) {
        throw new RemoteError('permission', 'other-vault');
      }
      if (!existing) await this.write(this.root, 'vault.json', jsonBytes(vault), false);
      await this.write(this.root, 'README.md', utf8Encode(VAULT_README), false);
    } catch (error) {
      return classify(error);
    }
  }

  /** La carpeta no tiene feed de cambios: cada consulta lista todas las revisiones (§8.3). */
  async pull(_cursor: string | null): Promise<RemoteChangePage> {
    try {
      this.objectNames = null;
      const revisionIds = (await this.names('revisions'))
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.slice(0, -5));
      const controls: VersionPrune[] = [];
      const controlsDir = await this.dir('controls', false);
      for (const name of controlsDir ? await this.names('controls') : []) {
        const bytes = await this.read(controlsDir!, name);
        try {
          if (bytes) controls.push(JSON.parse(utf8Decode(bytes)) as VersionPrune);
        } catch {
          // Un control ilegible se ignora; el motor valida los que sí se leen.
        }
      }
      return { revisionIds, controls, nextCursor: String(revisionIds.length), complete: true };
    } catch (error) {
      return classify(error);
    }
  }

  async getRevision(id: string): Promise<unknown> {
    try {
      const dir = await this.dir('revisions', false);
      const bytes = dir ? await this.read(dir, `${id}.json`) : null;
      if (!bytes) return null;
      try {
        return JSON.parse(utf8Decode(bytes));
      } catch {
        return null;
      }
    } catch (error) {
      return classify(error);
    }
  }

  async getObject(hash: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    try {
      this.objectNames ??= this.listObjectNames();
      let names: Map<string, string>;
      try {
        names = await this.objectNames;
      } catch (error) {
        this.objectNames = null;
        throw error;
      }
      const path = names.get(hash);
      if (!path) return null;
      const [folder, name] = path.split('/') as [string, string];
      const dir = await this.dir(folder, false);
      const bytes = dir ? await this.read(dir, name) : null;
      return bytes && { bytes, mimeType: mimeForPath(name) };
    } catch (error) {
      return classify(error);
    }
  }

  async putObject(object: RemoteObject, _operationId: string): Promise<void> {
    try {
      const path =
        object.role === 'asset'
          ? assetPath({ hash: object.hash, mimeType: object.mimeType })
          : objectPath(object.hash, object.role);
      const [folder, name] = path.split('/') as [string, string];
      await this.write((await this.dir(folder, true))!, name, object.bytes, false);
      (await this.objectNames?.catch(() => null))?.set(object.hash, path);
    } catch (error) {
      return classify(error);
    }
  }

  async publishRevision(revision: Revision, _operationId: string): Promise<WrittenCopy | null> {
    try {
      // Copia legible por versión (nunca se reescribe una existente, §8.3).
      if (isMarkdownKind(revision.metadata.kind) && revision.contentRefs.body) {
        const body = (await this.getObject(revision.contentRefs.body))?.bytes;
        if (body) {
          const readable = await this.dir('readable', true);
          const docDir = await readable!.getDirectoryHandle(revision.documentId, { create: true });
          await this.write(docDir, `${revision.id}.md`, body, false);
        }
      }
      // La revisión se publica al final: los lectores no la activan sin sus objetos.
      await this.write(
        (await this.dir('revisions', true))!,
        `${revision.id}.json`,
        jsonBytes(revision),
        false,
      );
      // La carpeta es local: leer una copia para observarla cuesta poco.
      return null;
    } catch (error) {
      return classify(error);
    }
  }

  async publishControl(control: VersionPrune): Promise<void> {
    try {
      await this.write(
        (await this.dir('controls', true))!,
        `${control.id}.json`,
        jsonBytes(control),
        false,
      );
    } catch (error) {
      return classify(error);
    }
  }

  /** Los índices sí se reescriben: son derivados y llevan el dispositivo en el nombre. */
  async publishIndexes(deviceId: string, documents: DocumentRecord[], vault: Vault): Promise<void> {
    try {
      for (const [path, bytes] of indexFiles(
        deviceId,
        documents,
        vault,
        new Date().toISOString(),
      )) {
        const parts = path.split('/');
        const dir = parts.length > 1 ? (await this.dir(parts[0]!, true))! : this.root;
        await this.write(dir, parts.at(-1)!, bytes, true);
      }
    } catch (error) {
      return classify(error);
    }
  }

  async listReadableCopies(): Promise<ReadableCopy[]> {
    try {
      const readable = await this.dir('readable', false);
      if (!readable) return [];
      const copies: ReadableCopy[] = [];
      for await (const docDir of readable.values()) {
        if (docDir.kind !== 'directory') continue;
        for await (const file of docDir.values()) {
          if (file.kind !== 'file' || !file.name.endsWith('.md')) continue;
          const handle = file;
          const info = await handle.getFile();
          copies.push({
            documentId: docDir.name,
            revisionId: file.name.slice(0, -3),
            path: `readable/${docDir.name}/${file.name}`,
            lastModified: info.lastModified,
            read: async () => new Uint8Array(await (await handle.getFile()).arrayBuffer()),
          });
        }
      }
      return copies;
    } catch (error) {
      return classify(error);
    }
  }

  private async listObjectNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const folder of ['objects', 'assets']) {
      for (const name of await this.names(folder))
        names.set(name.split('.')[0]!, `${folder}/${name}`);
    }
    return names;
  }

  private async dir(name: string, create: boolean): Promise<DirHandleLike | null> {
    try {
      return await this.root.getDirectoryHandle(name, { create });
    } catch (error) {
      if (!create && isNotFound(error)) return null;
      throw error;
    }
  }

  private async names(folder: string): Promise<string[]> {
    const dir = await this.dir(folder, false);
    if (!dir) return [];
    const names: string[] = [];
    for await (const entry of dir.values()) if (entry.kind === 'file') names.push(entry.name);
    return names;
  }

  private async read(dir: DirHandleLike, name: string): Promise<Uint8Array | null> {
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Escribe un archivo; si `overwrite` es false y ya existe, no lo toca (inmutable). */
  private async write(dir: DirHandleLike, name: string, bytes: Uint8Array, overwrite: boolean) {
    if (!overwrite) {
      try {
        await dir.getFileHandle(name);
        return;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(bytes);
    await writable.close();
  }
}
