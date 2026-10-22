import { isMarkdownKind, type DocumentRecord, type Revision } from '../../domain/revision.ts';
import {
  encryptionFileSchema,
  MAX_ENCRYPTION_FILE_BYTES,
  type EncryptionFile,
} from '../../domain/encryption.ts';
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
import type { VaultCipher } from '../../shared/crypto.ts';
import { utf8Decode, utf8Encode } from '../../shared/hash.ts';
import { FOLDER_MIME, hasProperty, quote, type DriveClient, type DriveFile } from './driveApi.ts';

/**
 * Tipos de archivo del almacén en Drive (`appProperties.mindnote`). Todo se busca por
 * propiedades (carpeta raíz + id/hash), nunca por ruta: dos carpetas `revisions` creadas a la
 * vez por dos equipos no rompen nada, solo duplican un contenedor. La propiedad `root` separa
 * dos carpetas del mismo almacén (p. ej. la antigua y la nueva al cambiar el modo de cifrado).
 */
type Kind =
  | 'vault'
  | 'vault-json'
  | 'encryption'
  | 'dir'
  | 'revision'
  | 'object'
  | 'control'
  | 'readable'
  | 'index';

/** Además del feed de cambios, cada cierto tiempo se relista todo (reintenta lo rechazado). */
const FULL_LISTING_MS = 10 * 60_000;
const OCTET = 'application/octet-stream';
/** Cuerpos recientes que se recuerdan para escribir las copias legibles. */
const RECENT_BODIES = 32;

export const ENCRYPTED_README = `# Almacén cifrado de MindNote

Esta carpeta contiene un almacén cifrado de extremo a extremo (AES-256-GCM). Solo se puede leer
con la aplicación, o con una herramienta que siga la especificación del formato
(docs/formato-almacen.md, §7), y la contraseña o el código de recuperación del almacén.

- vault.json: identidad del almacén (sin cifrar).
- encryption.json: clave del almacén envuelta con la contraseña y con el código de recuperación.
- revisions/, objects/, controls/, heads/: archivos cifrados (.bin).
`;

export interface DriveVaultEntry {
  folderId: string;
  folderName: string;
  vault: Vault;
  encrypted: boolean;
}

const notTrashed = 'trashed = false';

function props(kind: Kind, vaultId: string, root: string, extra: Record<string, string> = {}) {
  return { mindnote: kind, vaultId, root, ...extra };
}

export function driveFolderName(vault: Vault, encrypted: boolean): string {
  return `Aline - ${vault.name}${encrypted ? ' (cifrado)' : ''}`;
}

/**
 * Almacenes que esta aplicación creó en el Drive de la cuenta autorizada (drive.file). Se
 * omiten las carpetas sustituidas por otra al cambiar el modo de cifrado.
 */
export async function listDriveVaults(client: DriveClient): Promise<DriveVaultEntry[]> {
  const roots = await client.list(
    `${hasProperty('mindnote', 'vault')} and mimeType = ${quote(FOLDER_MIME)} and ${notTrashed}`,
  );
  const out: DriveVaultEntry[] = [];
  for (const root of roots) {
    if (root.appProperties?.['supersededBy']) continue;
    try {
      const vault = await new DriveRemoteStore(client, root.id).readVaultInfo();
      if (vault) {
        out.push({
          folderId: root.id,
          folderName: root.name,
          vault,
          encrypted: root.appProperties?.['encrypted'] === 'true',
        });
      }
    } catch (error) {
      // Una carpeta dañada no impide ver las demás.
      if (!(error instanceof RemoteError) || error.kind !== 'not-found') throw error;
    }
  }
  return out;
}

/**
 * Crea la carpeta raíz de un almacén en «Mi unidad»: vault.json y, si se cifra, encryption.json
 * (la clave envuelta) antes que cualquier contenido.
 */
export async function createDriveVault(
  client: DriveClient,
  vault: Vault,
  encryption: EncryptionFile | null,
): Promise<DriveVaultEntry> {
  const root = await client.createFolder(driveFolderName(vault, Boolean(encryption)), null, {
    mindnote: 'vault',
    vaultId: vault.id,
    ...(encryption ? { encrypted: 'true' } : {}),
  });
  if (encryption) {
    await client.createFile(
      {
        name: 'encryption.json',
        parents: [root.id],
        mimeType: 'application/json',
        appProperties: props('encryption', vault.id, root.id),
      },
      jsonBytes(encryptionFileSchema.parse(encryption)),
    );
  }
  await new DriveRemoteStore(client, root.id).initializeVault(vault, Boolean(encryption));
  return { folderId: root.id, folderName: root.name, vault, encrypted: Boolean(encryption) };
}

/** Lee encryption.json de una carpeta cifrada. */
export async function readDriveEncryption(
  client: DriveClient,
  rootId: string,
): Promise<EncryptionFile> {
  const [file] = await client.list(
    `${hasProperty('mindnote', 'encryption')} and ${hasProperty('root', rootId)} and ${notTrashed}`,
  );
  if (!file) throw new RemoteError('not-found', 'encryption-missing');
  // Se valida antes de derivar ninguna clave: un descriptor manipulado no impone su coste.
  const bytes = await client.download(file.id);
  let parsed;
  try {
    parsed =
      bytes.byteLength <= MAX_ENCRYPTION_FILE_BYTES
        ? encryptionFileSchema.safeParse(JSON.parse(utf8Decode(bytes)))
        : null;
  } catch {
    parsed = null;
  }
  if (!parsed?.success) throw new RemoteError('not-found', 'encryption-invalid');
  return parsed.data;
}

/** Sustituye encryption.json (cambio de contraseña o de código de recuperación). */
export async function writeDriveEncryption(
  client: DriveClient,
  rootId: string,
  encryption: EncryptionFile,
): Promise<void> {
  const [file] = await client.list(
    `${hasProperty('mindnote', 'encryption')} and ${hasProperty('root', rootId)} and ${notTrashed}`,
  );
  if (!file) throw new RemoteError('not-found', 'encryption-missing');
  await client.updateMedia(
    file.id,
    jsonBytes(encryptionFileSchema.parse(encryption)),
    'application/json',
  );
}

/** Marca una carpeta como sustituida: los demás equipos se trasladan a la nueva. */
export async function markDriveSuperseded(
  client: DriveClient,
  oldRootId: string,
  newRootId: string,
): Promise<void> {
  await client.updateMetadata(oldRootId, { appProperties: { supersededBy: newRootId } });
}

/**
 * Carpeta que sustituyó a esta (`supersededBy`), aunque esté en la papelera; null si no fue
 * sustituida o ya no existe. Al reubicarse se sigue este enlace, no cualquier carpeta con el
 * mismo id de almacén (auditoría 13/10/2026, H01).
 */
export async function driveSuccessor(client: DriveClient, rootId: string): Promise<string | null> {
  try {
    return (await client.getFile(rootId)).appProperties?.['supersededBy'] ?? null;
  } catch (error) {
    if (error instanceof RemoteError && error.kind === 'not-found') return null;
    throw error;
  }
}

/** Mueve una carpeta a la papelera de Drive (recuperable desde Drive durante un tiempo). */
export async function trashDriveFolder(client: DriveClient, rootId: string): Promise<void> {
  await client.updateMetadata(rootId, { trashed: true });
}

/**
 * Google Drive como almacén remoto (plan 4.5, diseño §8.2). Mismo contrato y mismo formato
 * abierto que la carpeta local: objetos primero, revisión al final; ningún objeto, revisión ni
 * control se reescribe (si ya existe con esas propiedades, no se vuelve a subir). Solo los
 * índices aceleradores se actualizan en su sitio.
 *
 * Con `cipher` (diseño §13.1), revisiones, objetos, controles e índices se suben cifrados con
 * nombres opacos y sin copias legibles; vault.json y encryption.json quedan sin cifrar.
 */
export class DriveRemoteStore implements RemoteStore {
  private readonly client: DriveClient;
  private readonly rootId: string;
  private readonly cipher: VaultCipher | null;
  private vaultId: string | null = null;
  private readonly dirs = new Map<string, Promise<string>>();
  /** revisionId → fileId de la última lista completa (evita una búsqueda por revisión). */
  private revisionFiles = new Map<string, string>();
  private readonly controlCache = new Map<string, VersionPrune | null>();
  /**
   * Cuerpos Markdown recién subidos (hash → bytes, los últimos): la copia legible de su versión
   * se escribe sin volver a buscarlos y descargarlos de Drive.
   */
  private readonly recentBodies = new Map<string, Uint8Array>();
  private lastFullListing = 0;
  private readonly now: () => number;

  constructor(
    client: DriveClient,
    rootId: string,
    options: { cipher?: VaultCipher | null; now?: () => number } = {},
  ) {
    this.client = client;
    this.rootId = rootId;
    this.cipher = options.cipher ?? null;
    this.now = options.now ?? Date.now;
  }

  /**
   * Comprueba la carpeta raíz antes de cada ciclo: si se sustituyó o está en la papelera, el
   * almacén «no está disponible» aquí; si su modo no coincide con este equipo, no se escribe.
   */
  async readVault(): Promise<Vault | null> {
    const root = await this.client.getFile(this.rootId);
    if (root.trashed) throw new RemoteError('not-found', 'root-trashed');
    if (root.appProperties?.['supersededBy']) {
      throw new RemoteError('not-found', 'root-superseded');
    }
    const encrypted = root.appProperties?.['encrypted'] === 'true';
    if (encrypted !== Boolean(this.cipher)) {
      throw new RemoteError('permission', encrypted ? 'root-needs-key' : 'root-not-encrypted');
    }
    return this.readVaultInfo();
  }

  /** vault.json sin comprobar el modo (para listar almacenes). */
  async readVaultInfo(): Promise<Vault | null> {
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
    if (!parsed?.success) throw new RemoteError('not-found', 'vault-invalid');
    this.vaultId = parsed.data.id;
    return parsed.data;
  }

  async initializeVault(vault: Vault, encrypted = Boolean(this.cipher)): Promise<void> {
    const existing = await this.readVaultInfo();
    if (existing && existing.id !== vault.id) {
      throw new RemoteError('permission', 'other-vault');
    }
    this.vaultId = vault.id;
    if (!existing) {
      await this.client.createFile(
        {
          name: 'vault.json',
          parents: [this.rootId],
          mimeType: 'application/json',
          appProperties: props('vault-json', vault.id, this.rootId),
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
          appProperties: props('index', vault.id, this.rootId, { path: 'README.md' }),
        },
        utf8Encode(encrypted ? ENCRYPTED_README : VAULT_README),
      );
    }
  }

  /**
   * El cursor es un startPageToken de Drive, tomado ANTES de listar para no perder cambios
   * concurrentes ([S14]). Con cursor, el feed dice si algo de esta carpeta cambió; si nada
   * cambió se evita relistar. Un cursor inválido provoca una reconciliación completa.
   */
  async pull(cursor: string | null): Promise<RemoteChangePage> {
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
            (c.file?.appProperties?.['root'] === this.rootId &&
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

    const revisions = await this.client.list(this.where('revision'));
    this.revisionFiles = new Map();
    for (const file of revisions) {
      const id = file.appProperties?.['revisionId'];
      if (id && !this.revisionFiles.has(id)) this.revisionFiles.set(id, file.id);
    }
    const controls: VersionPrune[] = [];
    for (const file of await this.client.list(this.where('control'))) {
      if (!this.controlCache.has(file.id)) {
        const id = file.appProperties?.['controlId'] ?? '';
        try {
          const bytes = await this.open('control', id, await this.client.download(file.id));
          this.controlCache.set(file.id, JSON.parse(utf8Decode(bytes)) as VersionPrune);
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
      (await this.client.list(this.where('revision', { revisionId: id })))[0]?.id;
    if (!fileId) return null;
    try {
      return JSON.parse(
        utf8Decode(await this.open('revision', id, await this.client.download(fileId))),
      );
    } catch (error) {
      // Ilegible, alterado o de otra clave: el motor lo rechaza como contenido inválido.
      if (error instanceof RemoteError && error.kind !== 'not-found') throw error;
      return null;
    }
  }

  async getObject(hash: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const [file] = await this.client.list(
      this.where('object', { hash: await this.objectKey(hash) }),
    );
    if (!file) return null;
    let bytes: Uint8Array;
    try {
      bytes = await this.client.download(file.id);
    } catch (error) {
      if (error instanceof RemoteError && error.kind === 'not-found') return null;
      throw error;
    }
    if (!this.cipher) return { bytes, mimeType: file.mimeType };
    try {
      return unpackObject(await this.cipher.decrypt('object', hash, bytes));
    } catch {
      // Alterado o de otra clave: equivale a un objeto ausente; el motor no activa la revisión.
      return null;
    }
  }

  async putObject(object: RemoteObject, operationId: string): Promise<void> {
    if (!this.cipher && object.role === 'note') this.rememberBody(object.hash, object.bytes);
    const key = await this.objectKey(object.hash);
    // Idempotente: una respuesta perdida no duplica el objeto en el siguiente intento.
    if ((await this.client.list(this.where('object', { hash: key }))).length) return;
    const { vaultId } = await this.ids();
    if (this.cipher) {
      await this.client.createFile(
        {
          name: `${key}.bin`,
          parents: [await this.dir('objects')],
          mimeType: OCTET,
          appProperties: props('object', vaultId, this.rootId, { hash: key, operationId }),
        },
        await this.cipher.encrypt('object', object.hash, packObject(object)),
      );
      return;
    }
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
        appProperties: props('object', vaultId, this.rootId, { hash: object.hash, operationId }),
      },
      object.bytes,
    );
  }

  async publishRevision(revision: Revision, operationId: string): Promise<WrittenCopy | null> {
    const { vaultId } = await this.ids();
    if ((await this.client.list(this.where('revision', { revisionId: revision.id }))).length) {
      return null;
    }
    let written: WrittenCopy | null = null;
    // Copia legible por versión (§8.3), antes de la revisión; no existe si se cifra.
    if (!this.cipher && isMarkdownKind(revision.metadata.kind) && revision.contentRefs.body) {
      const existing = await this.client.list(this.where('readable', { revisionId: revision.id }));
      const hash = revision.contentRefs.body;
      const recent = this.recentBodies.get(hash);
      const body = existing.length ? null : recent ? { bytes: recent } : await this.getObject(hash);
      if (body) {
        const copy = await this.client.createFile(
          {
            name: `${revision.id}.md`,
            parents: [await this.dir(`readable/${revision.documentId}`)],
            mimeType: 'text/markdown',
            appProperties: props('readable', vaultId, this.rootId, {
              documentId: revision.documentId,
              revisionId: revision.id,
            }),
          },
          body.bytes,
        );
        written = {
          path: `readable/${revision.documentId}/${revision.id}.md`,
          lastModified: copy.modifiedTime ? Date.parse(copy.modifiedTime) : 0,
        };
      }
    }
    const file = await this.client.createFile(
      {
        name: `${revision.id}.${this.cipher ? 'bin' : 'json'}`,
        parents: [await this.dir('revisions')],
        mimeType: this.cipher ? OCTET : 'application/json',
        // Cifrado: sin documentId, para no revelar qué versiones son del mismo documento.
        appProperties: props('revision', vaultId, this.rootId, {
          revisionId: revision.id,
          ...(this.cipher ? {} : { documentId: revision.documentId }),
          operationId,
        }),
      },
      await this.seal('revision', revision.id, jsonBytes(revision)),
    );
    this.revisionFiles.set(revision.id, file.id);
    return written;
  }

  async publishControl(control: VersionPrune): Promise<void> {
    const { vaultId } = await this.ids();
    if ((await this.client.list(this.where('control', { controlId: control.id }))).length) {
      return;
    }
    await this.client.createFile(
      {
        name: `${control.id}.${this.cipher ? 'bin' : 'json'}`,
        parents: [await this.dir('controls')],
        mimeType: this.cipher ? OCTET : 'application/json',
        appProperties: props('control', vaultId, this.rootId, { controlId: control.id }),
      },
      await this.seal('control', control.id, jsonBytes(control)),
    );
  }

  /** Los índices sí se reescriben: son derivados y no son autoridad (§6). */
  async publishIndexes(deviceId: string, documents: DocumentRecord[], vault: Vault): Promise<void> {
    const { vaultId } = await this.ids();
    for (const [path, plain] of indexFiles(deviceId, documents, vault, new Date().toISOString())) {
      const bytes = await this.seal('index', path, plain);
      const mime = this.cipher ? OCTET : 'application/json';
      const [existing] = await this.client.list(this.where('index', { path }));
      if (existing) {
        await this.client.updateMedia(existing.id, bytes, mime);
        continue;
      }
      const parts = path.split('/');
      const name = this.cipher ? parts.at(-1)!.replace(/\.json$/, '.bin') : parts.at(-1)!;
      await this.client.createFile(
        {
          name,
          parents: [parts.length > 1 ? await this.dir(parts[0]!) : this.rootId],
          mimeType: mime,
          appProperties: props('index', vaultId, this.rootId, { path }),
        },
        bytes,
      );
    }
  }

  /**
   * Copias legibles. Con drive.file solo se ven archivos creados por esta aplicación; una
   * edición que conserve el archivo (p. ej. Google Drive para ordenador) cambia modifiedTime.
   * Un almacén cifrado no tiene copias legibles.
   */
  async listReadableCopies(): Promise<ReadableCopy[]> {
    if (this.cipher) return [];
    const files = await this.client.list(this.where('readable'));
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

  private where(kind: Kind, extra: Record<string, string> = {}): string {
    return [
      hasProperty('mindnote', kind),
      hasProperty('root', this.rootId),
      ...Object.entries(extra).map(([k, v]) => hasProperty(k, v)),
      notTrashed,
    ].join(' and ');
  }

  private async ids(): Promise<{ vaultId: string }> {
    if (this.vaultId) return { vaultId: this.vaultId };
    const vault = await this.readVaultInfo();
    if (!vault) throw new RemoteError('not-found', 'vault-missing');
    return { vaultId: vault.id };
  }

  private objectKey(hash: string): Promise<string> {
    return this.cipher ? this.cipher.objectId(hash) : Promise.resolve(hash);
  }

  private seal(scope: 'revision' | 'control' | 'index', id: string, plain: Uint8Array) {
    return this.cipher ? this.cipher.encrypt(scope, id, plain) : Promise.resolve(plain);
  }

  private open(scope: 'revision' | 'control', id: string, bytes: Uint8Array) {
    return this.cipher ? this.cipher.decrypt(scope, id, bytes) : Promise.resolve(bytes);
  }

  private rememberBody(hash: string, bytes: Uint8Array) {
    this.recentBodies.delete(hash);
    this.recentBodies.set(hash, bytes);
    // Unos pocos bastan: el motor publica cada versión justo después de subir sus objetos.
    while (this.recentBodies.size > RECENT_BODIES) {
      this.recentBodies.delete(this.recentBodies.keys().next().value!);
    }
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
    const { vaultId } = await this.ids();
    const [found] = await this.client.list(this.where('dir', { path }));
    if (found) return found.id;
    const parts = path.split('/');
    const parent = parts.length > 1 ? await this.dir(parts.slice(0, -1).join('/')) : this.rootId;
    return (
      await this.client.createFolder(
        parts.at(-1)!,
        parent,
        props('dir', vaultId, this.rootId, { path }),
      )
    ).id;
  }
}

/** Objeto cifrado: el tipo MIME va dentro (2 bytes de longitud + MIME + contenido). */
function packObject(object: RemoteObject): Uint8Array {
  const mime = utf8Encode(object.mimeType);
  const out = new Uint8Array(2 + mime.byteLength + object.bytes.byteLength);
  new DataView(out.buffer).setUint16(0, mime.byteLength);
  out.set(mime, 2);
  out.set(object.bytes, 2 + mime.byteLength);
  return out;
}

function unpackObject(plain: Uint8Array): { bytes: Uint8Array; mimeType: string } {
  const length = new DataView(plain.buffer, plain.byteOffset).getUint16(0);
  return {
    mimeType: utf8Decode(plain.subarray(2, 2 + length)),
    bytes: plain.slice(2 + length),
  };
}
