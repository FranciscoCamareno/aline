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
import { dedupeTags } from '../domain/tags.ts';
import { bytesToBase64 } from '../shared/base64.ts';
import { sha256Hex, utf8Decode, utf8Encode } from '../shared/hash.ts';
import type { CanvasAsset, SerializedCanvas } from '../ports/CanvasAdapter.ts';
import type {
  CommitResult,
  StoredBlob,
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

  constructor(repo: VaultRepository & VaultReader) {
    this.repo = repo;
  }

  listDocuments(): Promise<DocumentRecord[]> {
    return this.repo.listDocuments();
  }

  async createDocument(kind: DocumentKind, title: string): Promise<DocumentRecord> {
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
      metadata: { kind, title: cleanTitle, folderId: null, tags: [], deleted: false },
      contentRefs: { body: body.hash, extensions: extensions?.hash ?? null, assets: [] },
      blobs,
    });
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
    if (
      scene.hash === head.contentRefs.body &&
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
      // El sidecar se conserva sin cambios: sus funciones aún no están implementadas.
      contentRefs: {
        body: scene.hash,
        extensions: head.contentRefs.extensions,
        assets: assetHashes,
      },
      blobs: [scene, ...assets],
    });
  }

  /**
   * RenameDocument: conserva el UUID y crea una revisión de metadatos (diseño §5.1). En notas,
   * vuelve a serializar el frontmatter y conserva el cuerpo.
   */
  renameDocument(documentId: Uuid, newTitle: string): Promise<CommitResult> {
    const title = validateTitle(newTitle);
    return this.serialized(documentId, async () =>
      this.renameNow(await this.sessionFor(documentId), title),
    );
  }

  private async renameNow(session: EditSession, title: string): Promise<CommitResult> {
    assertWritable(session);
    const head = await this.currentHead(session);
    const doc = await this.requireDocument(session.documentId);
    const { tags, folderId } = head.metadata;
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
      metadata: { kind: doc.kind, title, tags: dedupeTags(tags), folderId, deleted: false },
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
