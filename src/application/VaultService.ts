import {
  checkNoteFrontmatterVersion,
  checkRevision,
  checkSceneVersion,
  firstReason,
  parseCanvasExtensions,
  type ReadOnlyReason,
} from '../domain/compat.ts';
import { DomainError, validateTitle } from '../domain/errors.ts';
import {
  parseNoteMarkdown,
  serializeNoteMarkdown,
  type ParsedNote,
} from '../domain/frontmatter.ts';
import { newId, type Uuid } from '../domain/ids.ts';
import type { DocumentKind, DocumentRecord, Revision } from '../domain/revision.ts';
import { emptyCanvasExtensions, type CanvasExtensions } from '../domain/sidecar.ts';
import { wouldCreateCycle } from '../domain/folders.ts';
import { dedupeTags } from '../domain/tags.ts';
import { bytesToBase64 } from '../shared/base64.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../shared/hash.ts';
import type { CanvasAsset, SerializedCanvas } from '../ports/CanvasAdapter.ts';
import type {
  CommitInput,
  CommitResult,
  HistoryEntry,
  PurgeResult,
  StoredBlob,
  VaultContent,
  VaultReader,
  VaultRepository,
} from '../ports/VaultRepository.ts';

export const MIME = {
  markdown: 'text/markdown; charset=utf-8',
  excalidraw: 'application/vnd.excalidraw+json',
  extensions: 'application/json',
} as const;

/** Cabezas conocidas al abrir o al guardar por última vez; se pasan al siguiente commit. */
export interface EditSession {
  documentId: Uuid;
  knownHeads: Uuid[];
  /** Si no es null, el documento se muestra pero no se guarda (versión desconocida o inválida). */
  readOnly: ReadOnlyReason | null;
}

/**
 * Exportación de emergencia (diseño §7.1): todo el contenido local en un único JSON, para
 * cuando falta espacio o el almacén no es fiable. Provisional hasta la copia ZIP (plan 2.3).
 */
export interface EmergencyExport {
  kind: 'mindnote-emergency-export';
  exportFormatVersion: 1;
  exportedAt: string;
  snapshot: Awaited<ReturnType<VaultRepository['exportSnapshot']>>;
  blobs: Array<{ hash: string; mimeType: string; byteLength: number; base64: string }>;
  missingBlobs: string[];
}

const LAST_OPENED_KEY = 'lastOpenedDocumentId';

/** Contenido legible de una revisión, para vistas previas del historial y de conflictos. */
export type RevisionPreview =
  | { kind: 'note'; revision: Revision; body: string }
  | { kind: 'canvas'; revision: Revision; sceneJson: string | null };

/** Decisión del propietario ante dos o más cabezas (diseño §8.1). */
export type ConflictChoice =
  /** Conservar el contenido de una cabeza; las demás quedan en el historial. */
  | { kind: 'keep'; revisionId: Uuid }
  /** Notas: texto combinado a mano. */
  | { kind: 'merge'; body: string }
  /** Conservar una cabeza aquí y copiar otra a un documento nuevo (UUID nuevo). */
  | { kind: 'duplicate'; keepRevisionId: Uuid; copyRevisionId: Uuid; copyTitle: string };

export interface ResolveOutcome {
  result: CommitResult;
  duplicate: DocumentRecord | null;
}

/** Notificación de cada commit, para avisar a otras pestañas y refrescar la interfaz. */
export type CommitListener = (result: CommitResult) => void;

export interface OpenedNote {
  document: DocumentRecord;
  session: EditSession;
  /** Cuerpo Markdown sin frontmatter; es lo que se edita. */
  body: string;
  frontmatterInvalid: boolean;
  readOnly: ReadOnlyReason | null;
}

export interface OpenedCanvas {
  document: DocumentRecord;
  session: EditSession;
  sceneJson: string | null;
  extensions: CanvasExtensions;
  readOnly: ReadOnlyReason | null;
}

async function toBlob(bytes: Uint8Array, mimeType: string): Promise<StoredBlob> {
  return { hash: await sha256Hex(bytes), mimeType, byteLength: bytes.byteLength, bytes };
}

/**
 * Casos de uso del núcleo local (diseño §15): CreateDocument, SaveNote, SaveCanvas y
 * RenameDocument. Todas las modificaciones de contenido pasan por aquí.
 */
export class VaultService {
  private readonly repo: VaultRepository & VaultReader;
  /** Una sesión compartida por documento: editor y biblioteca avanzan las mismas cabezas. */
  private readonly sessions = new Map<Uuid, EditSession>();
  /** Cola de escritura por documento para que dos commits no partan de la misma cabeza. */
  private readonly writeQueues = new Map<Uuid, Promise<unknown>>();

  private readonly listeners = new Set<CommitListener>();

  constructor(repo: VaultRepository & VaultReader) {
    this.repo = repo;
  }

  onCommit(listener: CommitListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listDocuments(): Promise<DocumentRecord[]> {
    return this.repo.listDocuments();
  }

  async createDocument(
    kind: DocumentKind,
    title: string,
    folderId: Uuid | null = null,
  ): Promise<DocumentRecord> {
    const cleanTitle = validateTitle(title);
    const documentId = newId();
    const blobs: StoredBlob[] = [];
    let body: StoredBlob;
    let extensions: StoredBlob | null = null;

    if (kind === 'note') {
      body = await toBlob(
        utf8Encode(this.noteMarkdown(documentId, cleanTitle, [], `# ${cleanTitle}\n`)),
        MIME.markdown,
      );
    } else {
      body = await toBlob(utf8Encode(emptySceneJson()), MIME.excalidraw);
      extensions = await toBlob(
        utf8Encode(JSON.stringify(emptyCanvasExtensions(documentId))),
        MIME.extensions,
      );
      blobs.push(extensions);
    }
    blobs.push(body);

    const result = await this.repo.commit({
      documentId,
      kind,
      operation: 'save',
      knownHeads: [],
      metadata: { kind, title: cleanTitle, folderId, tags: [], deleted: false },
      contentRefs: { body: body.hash, extensions: extensions?.hash ?? null, assets: [] },
      blobs,
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  async openNote(documentId: Uuid): Promise<OpenedNote> {
    await this.pendingWrites(documentId);
    const { document, head } = await this.loadHead(documentId, 'note');
    const text = head.contentRefs.body ? await this.readText(head.contentRefs.body) : '';
    const parsed: ParsedNote = parseNoteMarkdown(text);
    const readOnly = firstReason(
      checkRevision(head),
      checkNoteFrontmatterVersion(parsed.frontmatter?.schemaVersion),
    );
    return {
      document,
      session: this.openSession(documentId, head, readOnly),
      body: parsed.body,
      frontmatterInvalid: parsed.invalid,
      readOnly,
    };
  }

  async openCanvas(documentId: Uuid): Promise<OpenedCanvas> {
    await this.pendingWrites(documentId);
    const { document, head } = await this.loadHead(documentId, 'canvas');
    const sceneJson = head.contentRefs.body ? await this.readText(head.contentRefs.body) : null;
    let sidecar: ReturnType<typeof parseCanvasExtensions> = {
      extensions: emptyCanvasExtensions(documentId),
      readOnly: null,
    };
    if (head.contentRefs.extensions) {
      try {
        sidecar = parseCanvasExtensions(
          JSON.parse(await this.readText(head.contentRefs.extensions)),
        );
      } catch {
        sidecar = { extensions: null, readOnly: 'invalid-content' };
      }
    }
    const readOnly = firstReason(
      checkRevision(head),
      sidecar.readOnly,
      checkSceneVersion(sceneJson),
    );
    return {
      document,
      session: this.openSession(documentId, head, readOnly),
      sceneJson,
      // Con un sidecar no legible se muestra la escena; el sidecar original no se toca.
      extensions: sidecar.extensions ?? emptyCanvasExtensions(documentId),
      readOnly,
    };
  }

  async loadAsset(hash: string): Promise<CanvasAsset | undefined> {
    const blob = await this.repo.getBlob(hash);
    return blob && { hash: blob.hash, mimeType: blob.mimeType, bytes: blob.bytes };
  }

  /** SaveNote: el frontmatter se vuelve a serializar desde los metadatos vigentes. */
  saveNote(session: EditSession, body: string): Promise<CommitResult> {
    return this.serialized(session.documentId, () => this.saveNoteNow(session, body));
  }

  private async saveNoteNow(session: EditSession, body: string): Promise<CommitResult> {
    assertWritable(session);
    const head = await this.currentHead(session);
    const { title, tags, folderId } = head.metadata;
    const markdown = await toBlob(
      utf8Encode(this.noteMarkdown(session.documentId, title, tags, body)),
      MIME.markdown,
    );
    if (markdown.hash === head.contentRefs.body) return this.unchanged(session, head);
    return this.commitAndAdvance(session, {
      documentId: session.documentId,
      kind: 'note',
      operation: 'save',
      knownHeads: session.knownHeads,
      metadata: { kind: 'note', title, tags, folderId, deleted: false },
      contentRefs: { body: markdown.hash, extensions: null, assets: [] },
      blobs: [markdown],
    });
  }

  /** SaveCanvas: la escena es opaca para la aplicación; los assets llegan con hash calculado. */
  /**
   * Acepta la serialización como promesa para encolar el guardado de inmediato: así una
   * reapertura del mismo lienzo espera a que termine (ver pendingWrites).
   */
  saveCanvas(
    session: EditSession,
    canvas: SerializedCanvas | Promise<SerializedCanvas>,
  ): Promise<CommitResult> {
    return this.serialized(session.documentId, async () =>
      this.saveCanvasNow(session, await canvas),
    );
  }

  private async saveCanvasNow(
    session: EditSession,
    canvas: SerializedCanvas,
  ): Promise<CommitResult> {
    assertWritable(session);
    const head = await this.currentHead(session);
    const scene = await toBlob(utf8Encode(canvas.sceneJson), MIME.excalidraw);
    const assets: StoredBlob[] = canvas.assets.map((a) => ({
      hash: a.hash,
      mimeType: a.mimeType,
      byteLength: a.bytes.byteLength,
      bytes: a.bytes,
    }));
    const assetHashes = [...new Set(assets.map((a) => a.hash))].sort();
    const sidecar = canvas.extensions
      ? await toBlob(utf8Encode(JSON.stringify(canvas.extensions)), MIME.extensions)
      : null;
    const extensionsHash = sidecar?.hash ?? head.contentRefs.extensions;
    if (
      scene.hash === head.contentRefs.body &&
      extensionsHash === head.contentRefs.extensions &&
      assetHashes.join() === [...head.contentRefs.assets].sort().join()
    ) {
      return this.unchanged(session, head);
    }
    const { title, tags, folderId } = head.metadata;
    return this.commitAndAdvance(session, {
      documentId: session.documentId,
      kind: 'canvas',
      operation: 'save',
      knownHeads: session.knownHeads,
      metadata: { kind: 'canvas', title, tags, folderId, deleted: false },
      contentRefs: {
        body: scene.hash,
        extensions: extensionsHash,
        assets: assetHashes,
      },
      blobs: [scene, ...assets, ...(sidecar ? [sidecar] : [])],
    });
  }

  /**
   * RenameDocument: conserva el UUID y crea una revisión de metadatos (diseño §5.1). En notas,
   * vuelve a serializar el frontmatter y conserva el cuerpo.
   */
  renameDocument(documentId: Uuid, newTitle: string): Promise<CommitResult> {
    const title = validateTitle(newTitle);
    return this.updateMetadata(documentId, { title });
  }

  /** SetTags: etiquetas normalizadas (NFC, sin duplicados sin distinguir mayúsculas, RN-08). */
  setTags(documentId: Uuid, tags: readonly string[]): Promise<CommitResult> {
    return this.updateMetadata(documentId, { tags: dedupeTags(tags) });
  }

  /**
   * MoveDocument: cambia la carpeta de una nota, un lienzo o una carpeta. Una carpeta no puede
   * moverse dentro de sí misma ni de sus descendientes. Nunca mueve en cascada.
   */
  async moveDocument(documentId: Uuid, folderId: Uuid | null): Promise<CommitResult> {
    const documents = await this.repo.listDocuments();
    if (folderId) {
      const target = documents.find((d) => d.id === folderId);
      if (target?.kind !== 'folder' || target.deleted) {
        throw new DomainError('not-found', 'Carpeta de destino no encontrada');
      }
      if (wouldCreateCycle(documents, documentId, folderId)) {
        throw new DomainError('invalid-title', 'Una carpeta no puede contenerse a sí misma');
      }
    }
    return this.updateMetadata(documentId, { folderId });
  }

  /** CreateFolder: entidad revisionada, sin contenido (diseño §5). */
  async createFolder(title: string, parentId: Uuid | null = null): Promise<DocumentRecord> {
    const cleanTitle = validateTitle(title);
    if (parentId) {
      const parent = await this.repo.getDocument(parentId);
      if (parent?.kind !== 'folder' || parent.deleted) {
        throw new DomainError('not-found', 'Carpeta padre no encontrada');
      }
    }
    const result = await this.repo.commit({
      documentId: newId(),
      kind: 'folder',
      operation: 'save',
      knownHeads: [],
      metadata: { kind: 'folder', title: cleanTitle, folderId: parentId, tags: [], deleted: false },
      contentRefs: { body: null, extensions: null, assets: [] },
      blobs: [],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  private updateMetadata(
    documentId: Uuid,
    patch: { title?: string; tags?: string[]; folderId?: Uuid | null },
  ): Promise<CommitResult> {
    return this.serialized(documentId, async () =>
      this.metadataNow(await this.sessionFor(documentId), patch),
    );
  }

  /**
   * Revisión de metadatos (diseño §5.1): conserva el UUID y el contenido; en notas vuelve a
   * serializar el frontmatter para que coincida con los metadatos nuevos.
   */
  private async metadataNow(
    session: EditSession,
    patch: { title?: string; tags?: string[]; folderId?: Uuid | null },
  ): Promise<CommitResult> {
    assertWritable(session);
    const head = await this.currentHead(session);
    const doc = await this.requireDocument(session.documentId);
    const title = patch.title ?? head.metadata.title;
    const tags = patch.tags ?? head.metadata.tags;
    const folderId = patch.folderId === undefined ? head.metadata.folderId : patch.folderId;
    let contentRefs = head.contentRefs;
    const blobs: StoredBlob[] = [];

    if (doc.kind === 'note') {
      const previous = head.contentRefs.body ? await this.readText(head.contentRefs.body) : '';
      const parsed = parseNoteMarkdown(previous);
      // Reescribir un frontmatter de versión posterior lo degradaría: se rechaza.
      if (checkNoteFrontmatterVersion(parsed.frontmatter?.schemaVersion)) {
        throw new DomainError('unsupported-version', 'Nota en solo lectura');
      }
      const markdown = await toBlob(
        utf8Encode(this.noteMarkdown(doc.id, title, tags, parsed.body)),
        MIME.markdown,
      );
      contentRefs = { ...contentRefs, body: markdown.hash };
      blobs.push(markdown);
    }

    return this.commitAndAdvance(session, {
      documentId: doc.id,
      kind: doc.kind,
      operation: 'save',
      knownHeads: session.knownHeads,
      metadata: {
        kind: doc.kind,
        title,
        tags: dedupeTags(tags),
        folderId,
        deleted: head.metadata.deleted,
      },
      contentRefs,
      blobs,
    });
  }

  /** Sesión vigente del documento; si no está abierto, parte de su cabeza más reciente. */
  private async sessionFor(documentId: Uuid): Promise<EditSession> {
    const existing = this.sessions.get(documentId);
    if (existing) return existing;
    const { head } = await this.loadHead(documentId);
    return this.openSession(documentId, head, checkRevision(head));
  }

  /**
   * Con varias cabezas (conflicto) la sesión sigue solo la abierta: un guardado posterior crea
   * otra rama en vez de fusionar el conflicto sin decisión del propietario.
   */
  private openSession(
    documentId: Uuid,
    head: Revision,
    readOnly: ReadOnlyReason | null,
  ): EditSession {
    let session = this.sessions.get(documentId);
    if (!session) {
      session = { documentId, knownHeads: [head.id], readOnly };
      this.sessions.set(documentId, session);
    } else {
      if (!session.knownHeads.includes(head.id)) session.knownHeads = [head.id];
      session.readOnly = readOnly;
    }
    return session;
  }

  /** Papelera (RN-03): revisión `delete` que conserva contenido e identidad. */
  trashDocument(documentId: Uuid): Promise<CommitResult> {
    return this.serialized(documentId, async () => {
      const session = await this.sessionFor(documentId);
      assertWritable(session);
      const head = await this.currentHead(session);
      const doc = await this.requireDocument(documentId);
      return this.commitAndAdvance(session, {
        documentId,
        kind: doc.kind,
        operation: 'delete',
        knownHeads: session.knownHeads,
        metadata: { ...head.metadata, deleted: true },
        contentRefs: head.contentRefs,
        blobs: [],
      });
    });
  }

  /** Sacar de la papelera: revisión `restore` con el mismo contenido. */
  restoreFromTrash(documentId: Uuid): Promise<CommitResult> {
    return this.serialized(documentId, async () => {
      const session = await this.sessionFor(documentId);
      const head = await this.currentHead(session);
      const doc = await this.requireDocument(documentId);
      return this.commitAndAdvance(session, {
        documentId,
        kind: doc.kind,
        operation: 'restore',
        knownHeads: session.knownHeads,
        metadata: { ...head.metadata, deleted: false },
        contentRefs: head.contentRefs,
        blobs: [],
      });
    });
  }

  /** Borrado definitivo, solo desde la papelera y por acción explícita (RN-03, RN-13). */
  async purgeDocument(documentId: Uuid): Promise<PurgeResult> {
    await this.pendingWrites(documentId);
    const result = await this.repo.purgeDocument(documentId);
    this.sessions.delete(documentId);
    this.writeQueues.delete(documentId);
    return result;
  }

  listHistory(documentId: Uuid): Promise<HistoryEntry[]> {
    return this.repo.listHistory(documentId);
  }

  async previewRevision(revisionId: Uuid): Promise<RevisionPreview> {
    const revision = await this.repo.getRevision(revisionId);
    if (!revision) throw new DomainError('not-found', 'Revisión no encontrada');
    const text = revision.contentRefs.body ? await this.readText(revision.contentRefs.body) : null;
    return revision.metadata.kind === 'note'
      ? { kind: 'note', revision, body: parseNoteMarkdown(text ?? '').body }
      : { kind: 'canvas', revision, sceneJson: text };
  }

  /**
   * Restaurar una versión (diseño §7.2, FP-06): revisión nueva con el contenido antiguo y padre
   * en la cabeza actual; la versión reemplazada sigue en el historial.
   */
  restoreRevision(documentId: Uuid, revisionId: Uuid): Promise<CommitResult> {
    return this.serialized(documentId, async () => {
      const session = await this.sessionFor(documentId);
      const old = await this.repo.getRevision(revisionId);
      if (old?.documentId !== documentId)
        throw new DomainError('not-found', 'Revisión no encontrada');
      const reason = checkRevision(old);
      if (reason) throw new DomainError('unsupported-version', 'Versión en solo lectura');
      const doc = await this.requireDocument(documentId);
      return this.commitAndAdvance(session, {
        documentId,
        kind: doc.kind,
        operation: 'restore',
        knownHeads: session.knownHeads,
        metadata: { ...old.metadata, deleted: false },
        contentRefs: old.contentRefs,
        blobs: [],
      });
    });
  }

  /** Cabezas divergentes de un documento, de la más antigua a la más reciente. */
  async conflictHeads(documentId: Uuid): Promise<Revision[]> {
    const heads = await this.repo.getHeads(documentId);
    return heads.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Resolver un conflicto (diseño §8.1): la revisión nueva tiene como padres todas las cabezas,
   * así que ninguna rama desaparece del historial.
   */
  resolveConflict(documentId: Uuid, choice: ConflictChoice): Promise<ResolveOutcome> {
    return this.serialized(documentId, async () => {
      const doc = await this.requireDocument(documentId);
      const heads = doc.headRevisionIds;
      if (heads.length < 2) throw new DomainError('not-found', 'El documento no está en conflicto');
      const session = await this.sessionFor(documentId);
      session.knownHeads = [...heads];

      const byId = async (id: Uuid): Promise<Revision> => {
        if (!heads.includes(id))
          throw new DomainError('not-found', 'No es una cabeza del conflicto');
        const rev = await this.repo.getRevision(id);
        if (!rev) throw new DomainError('not-found', 'Revisión no encontrada');
        return rev;
      };

      let input: CommitInput;
      let duplicate: DocumentRecord | null = null;
      if (choice.kind === 'merge') {
        if (doc.kind !== 'note') throw new DomainError('not-found', 'Solo se combinan notas');
        const base = (await this.conflictHeads(documentId)).at(-1)!;
        const markdown = await toBlob(
          utf8Encode(
            this.noteMarkdown(documentId, base.metadata.title, base.metadata.tags, choice.body),
          ),
          MIME.markdown,
        );
        input = {
          documentId,
          kind: 'note',
          operation: 'resolve',
          knownHeads: heads,
          metadata: { ...base.metadata, deleted: false },
          contentRefs: { body: markdown.hash, extensions: null, assets: [] },
          blobs: [markdown],
        };
      } else {
        const keepId = choice.kind === 'keep' ? choice.revisionId : choice.keepRevisionId;
        const kept = await byId(keepId);
        if (choice.kind === 'duplicate') {
          duplicate = await this.duplicateRevision(
            await byId(choice.copyRevisionId),
            choice.copyTitle,
          );
        }
        input = {
          documentId,
          kind: doc.kind,
          operation: 'resolve',
          knownHeads: heads,
          metadata: kept.metadata,
          contentRefs: kept.contentRefs,
          blobs: [],
        };
      }
      const result = await this.commitAndAdvance(session, input);
      return { result, duplicate };
    });
  }

  /** Copia una revisión a un documento nuevo con UUID nuevo (diseño §5: un duplicado recibe UUID nuevo). */
  private async duplicateRevision(source: Revision, title: string): Promise<DocumentRecord> {
    const documentId = newId();
    const cleanTitle = validateTitle(title);
    let contentRefs = source.contentRefs;
    const blobs: StoredBlob[] = [];
    if (source.metadata.kind === 'note') {
      const body = parseNoteMarkdown(
        source.contentRefs.body ? await this.readText(source.contentRefs.body) : '',
      ).body;
      const markdown = await toBlob(
        utf8Encode(this.noteMarkdown(documentId, cleanTitle, source.metadata.tags, body)),
        MIME.markdown,
      );
      contentRefs = { ...contentRefs, body: markdown.hash };
      blobs.push(markdown);
    } else if (source.contentRefs.extensions) {
      const sidecar = parseCanvasExtensions(
        JSON.parse(await this.readText(source.contentRefs.extensions)),
      ).extensions;
      if (sidecar) {
        const ext = await toBlob(
          utf8Encode(JSON.stringify({ ...sidecar, documentId })),
          MIME.extensions,
        );
        contentRefs = { ...contentRefs, extensions: ext.hash };
        blobs.push(ext);
      }
    }
    const kind = source.metadata.kind === 'note' ? 'note' : 'canvas';
    const result = await this.repo.commit({
      documentId,
      kind,
      operation: 'save',
      knownHeads: [],
      metadata: { ...source.metadata, kind, title: cleanTitle, deleted: false },
      contentRefs,
      blobs,
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  /**
   * Edición hecha fuera de la aplicación en una copia legible (diseño §8.3): revisión `external`
   * con los bytes exactos del archivo y cuyo padre es la versión de la que salió la copia. Si
   * la aplicación ya tenía una edición posterior, ambas quedan en conflicto; nada se sobrescribe.
   * Devuelve el id de la revisión creada, o null si el archivo no corresponde a esta nota.
   */
  importExternalNote(
    documentId: Uuid,
    parentRevisionId: Uuid,
    bytes: Uint8Array,
  ): Promise<string | null> {
    return this.serialized(documentId, async () => {
      const doc = await this.repo.getDocument(documentId);
      const parent = await this.repo.getRevision(parentRevisionId);
      if (doc?.kind !== 'note' || parent?.documentId !== documentId) return null;
      let text: string;
      try {
        text = utf8Decode(bytes);
      } catch {
        return null; // No es UTF-8 válido: no se importa como nota.
      }
      const parsed = parseNoteMarkdown(text);
      // Un frontmatter con otro UUID pertenece a otra nota: no se asocia en silencio.
      if (parsed.frontmatter && parsed.frontmatter.id !== documentId) return null;
      let title = parent.metadata.title;
      try {
        if (parsed.frontmatter) title = validateTitle(parsed.frontmatter.title);
      } catch {
        // Título vacío o inválido en el archivo: se conserva el anterior.
      }
      const tags = parsed.frontmatter ? dedupeTags(parsed.frontmatter.tags) : parent.metadata.tags;
      const blob = await toBlob(bytes, MIME.markdown);
      const result = await this.repo.commit({
        documentId,
        kind: 'note',
        operation: 'external',
        knownHeads: [parentRevisionId],
        metadata: { ...parent.metadata, title, tags, deleted: false },
        contentRefs: { body: blob.hash, extensions: null, assets: [] },
        blobs: [blob],
      });
      for (const listener of this.listeners) listener(result);
      return result.revision.id;
    });
  }

  /** Contenido completo y coherente, tras vaciar las escrituras pendientes (copia ZIP). */
  async exportContent(): Promise<VaultContent> {
    await this.whenIdle();
    return this.repo.exportContent();
  }

  /**
   * Borrador del trazo en curso (diseño §7.1): se guarda periódicamente mientras el lápiz o el
   * ratón siguen apoyados, con un ciclo distinto al de las revisiones, para no perder una línea
   * larga si la aplicación se cierra antes de levantar el puntero.
   */
  saveStrokeDraft(documentId: Uuid, element: unknown): Promise<void> {
    return this.repo.setDevicePreference(`draft:${documentId}`, {
      element,
      savedAt: new Date().toISOString(),
    });
  }

  clearStrokeDraft(documentId: Uuid): Promise<void> {
    return this.repo.setDevicePreference(`draft:${documentId}`, null);
  }

  /** Devuelve y elimina el borrador pendiente del documento, si lo hay. */
  async takeStrokeDraft(documentId: Uuid): Promise<{ element: unknown; savedAt: string } | null> {
    const draft = (await this.repo.getDevicePreference(`draft:${documentId}`)) as
      | {
          element: unknown;
          savedAt: string;
        }
      | null
      | undefined;
    if (!draft) return null;
    await this.clearStrokeDraft(documentId);
    return draft;
  }

  /** Espera a que terminen todas las escrituras encoladas (p. ej. antes de actualizar la app). */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.writeQueues.values()].map((p) => p.catch(() => undefined)));
  }

  /** Último documento abierto en este dispositivo (FP-01, paso 2). */
  async lastOpenedDocumentId(): Promise<Uuid | null> {
    const id = await this.repo.getDevicePreference(LAST_OPENED_KEY);
    return typeof id === 'string' ? id : null;
  }

  rememberLastOpened(documentId: Uuid): Promise<void> {
    return this.repo.setDevicePreference(LAST_OPENED_KEY, documentId);
  }

  /** Exportación de emergencia: documentos, revisiones y todos los blobs guardados. */
  async exportEmergency(): Promise<EmergencyExport> {
    await this.whenIdle();
    const snapshot = await this.repo.exportSnapshot();
    const blobs: EmergencyExport['blobs'] = [];
    const missingBlobs: string[] = [];
    for (const hash of snapshot.blobHashes) {
      const blob = await this.repo.getBlob(hash);
      if (!blob) {
        missingBlobs.push(hash);
        continue;
      }
      blobs.push({
        hash,
        mimeType: blob.mimeType,
        byteLength: blob.byteLength,
        base64: bytesToBase64(blob.bytes),
      });
    }
    return {
      kind: 'mindnote-emergency-export',
      exportFormatVersion: 1,
      exportedAt: new Date().toISOString(),
      snapshot,
      blobs,
      missingBlobs,
    };
  }

  /** Una lectura para abrir un documento espera a sus escrituras ya encoladas. */
  private async pendingWrites(documentId: Uuid): Promise<void> {
    await this.writeQueues.get(documentId)?.catch(() => undefined);
  }

  private serialized<T>(documentId: Uuid, task: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(documentId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.writeQueues.set(documentId, next);
    return next;
  }

  private noteMarkdown(id: Uuid, title: string, tags: string[], body: string): string {
    return serializeNoteMarkdown({ schemaVersion: 1, id, title, tags }, body);
  }

  private async commitAndAdvance(
    session: EditSession,
    input: Parameters<VaultRepository['commit']>[0],
  ): Promise<CommitResult> {
    const result = await this.repo.commit(input);
    // Tras un conflicto la sesión sigue la rama propia: no se sobrescribe la ajena.
    session.knownHeads = [result.revision.id];
    for (const listener of this.listeners) listener(result);
    return result;
  }

  private async unchanged(session: EditSession, head: Revision): Promise<CommitResult> {
    const document = await this.requireDocument(session.documentId);
    return {
      status: document.headRevisionIds.length > 1 ? 'conflict' : 'committed',
      revision: head,
      document,
    };
  }

  /** Revisión base de la sesión (la última cabeza conocida por este editor). */
  private async currentHead(session: EditSession): Promise<Revision> {
    const id = session.knownHeads[session.knownHeads.length - 1];
    const head = id ? await this.repo.getRevision(id) : undefined;
    if (!head) throw new DomainError('not-found', 'Revisión base no encontrada');
    return head;
  }

  private async requireDocument(documentId: Uuid): Promise<DocumentRecord> {
    const doc = await this.repo.getDocument(documentId);
    if (!doc) throw new DomainError('not-found', 'Documento no encontrado');
    return doc;
  }

  private async loadHead(
    documentId: Uuid,
    kind?: DocumentKind,
  ): Promise<{ document: DocumentRecord; head: Revision }> {
    const document = await this.requireDocument(documentId);
    if (kind && document.kind !== kind)
      throw new DomainError('not-found', 'Tipo de documento distinto');
    // Con varias cabezas (conflicto) se abre la más reciente; la UI de resolución está pendiente.
    const heads = await this.repo.getHeads(documentId);
    const head = heads.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    if (!head) throw new DomainError('not-found', 'Documento sin revisiones');
    return { document, head };
  }

  private async readText(hash: string): Promise<string> {
    const blob = await this.repo.getBlob(hash);
    if (!blob) throw new DomainError('not-found', `Objeto ausente: ${hash}`);
    return utf8Decode(blob.bytes);
  }
}

function assertWritable(session: EditSession): void {
  if (session.readOnly) {
    throw new DomainError('unsupported-version', `Documento en solo lectura (${session.readOnly})`);
  }
}

function emptySceneJson(): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'mindnote',
    elements: [],
    appState: {},
    files: {},
  });
}
