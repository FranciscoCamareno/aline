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
import {
  emptyCalendar,
  mergeCalendars,
  parseCalendar,
  validateEvent,
  type CalendarData,
  type EventColor,
} from '../domain/calendar.ts';
import {
  folderKindFor,
  isMarkdownKind,
  type ContentRefs,
  type DocumentKind,
  type DocumentRecord,
  type Revision,
  type RevisionKind,
  type RevisionMetadata,
} from '../domain/revision.ts';
import { markdownAssetRefs, richDocAssetRefs } from '../domain/docAssets.ts';
import { docTabs, emptyRichDoc, parseRichDoc, type RichDocData } from '../domain/richDoc.ts';
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
  VersionSpace,
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
  calendar: 'application/json',
  richDoc: 'application/json',
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
  | { kind: 'canvas'; revision: Revision; sceneJson: string | null }
  | { kind: 'calendar'; revision: Revision; calendar: CalendarData }
  | { kind: 'doc'; revision: Revision; doc: RichDocData };

/** Decisión del propietario ante dos o más cabezas (diseño §8.1). */
export type ConflictChoice =
  /** Conservar el contenido de una cabeza; las demás quedan en el historial. */
  | { kind: 'keep'; revisionId: Uuid }
  /** Notas: texto combinado a mano. */
  | { kind: 'merge'; body: string }
  /** Calendarios: la unión de los eventos de todas las cabezas. */
  | { kind: 'merge-events' }
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

export interface OpenedCalendar {
  document: DocumentRecord;
  session: EditSession;
  calendar: CalendarData;
  readOnly: ReadOnlyReason | null;
}

export interface OpenedRichDoc {
  document: DocumentRecord;
  session: EditSession;
  doc: RichDocData;
  readOnly: ReadOnlyReason | null;
}

export interface OpenedTemplate {
  document: DocumentRecord;
  /** Escena .excalidraw con `mindnote-asset:<sha256>` en lugar de cada imagen. */
  sceneJson: string;
  readOnly: ReadOnlyReason | null;
}

async function toBlob(bytes: Uint8Array, mimeType: string): Promise<StoredBlob> {
  return { hash: await sha256Hex(bytes), mimeType, byteLength: bytes.byteLength, bytes };
}

/**
 * Casos de uso del núcleo local (diseño §15): CreateDocument, SaveNote, SaveCanvas y
 * RenameDocument. Todas las modificaciones de contenido pasan por aquí.
 */
/** Cambio de metadatos: `sortKey: null` quita el orden manual; `archived: false`, el archivado. */
interface MetadataPatch {
  title?: string;
  tags?: string[];
  folderId?: Uuid | null;
  sortKey?: string | null;
  archived?: boolean;
}

/** Metadatos con los campos opcionales del cambio; los valores por defecto no se escriben. */
function withOptional(metadata: RevisionMetadata, patch: MetadataPatch): RevisionMetadata {
  const { sortKey: oldKey, archived: oldArchived, ...rest } = metadata;
  const sortKey = patch.sortKey === undefined ? oldKey : patch.sortKey;
  const archived = patch.archived ?? oldArchived;
  return { ...rest, ...(sortKey ? { sortKey } : {}), ...(archived ? { archived: true } : {}) };
}

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

  /**
   * ImportNote (RF-35): documento nuevo con su contenido en una sola revisión. Usa la
   * operación `save` para no ampliar el formato v1. Notifica a los oyentes como cualquier commit.
   */
  async importNote(input: {
    title: string;
    body: string;
    tags?: readonly string[];
    folderId?: Uuid | null;
  }): Promise<DocumentRecord> {
    const title = validateTitle(input.title);
    const tags = dedupeTags(input.tags ?? []);
    const documentId = newId();
    const body = await toBlob(
      utf8Encode(this.noteMarkdown(documentId, title, tags, input.body)),
      MIME.markdown,
    );
    const result = await this.repo.commit({
      documentId,
      kind: 'note',
      operation: 'save',
      knownHeads: [],
      metadata: { kind: 'note', title, folderId: input.folderId ?? null, tags, deleted: false },
      contentRefs: { body: body.hash, extensions: null, assets: [] },
      blobs: [body],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  /**
   * ImportCanvas (RF-34): lienzo nuevo con la escena ya serializada por el adaptador. El sidecar
   * se deriva con el id definitivo del documento (`extensionsFor`).
   */
  async importCanvas(input: {
    title: string;
    canvas: SerializedCanvas;
    folderId?: Uuid | null;
    extensionsFor?: (base: CanvasExtensions) => CanvasExtensions;
  }): Promise<DocumentRecord> {
    const title = validateTitle(input.title);
    const documentId = newId();
    const base = emptyCanvasExtensions(documentId);
    const extensions = input.extensionsFor ? input.extensionsFor(base) : base;
    // Contenido que llega de fuera: cada asset debe corresponder a su hash.
    for (const asset of input.canvas.assets) {
      if ((await sha256Hex(asset.bytes)) !== asset.hash) {
        throw new DomainError('invalid-content', 'Un adjunto importado no coincide con su hash');
      }
    }
    const scene = await toBlob(utf8Encode(input.canvas.sceneJson), MIME.excalidraw);
    const sidecar = await toBlob(utf8Encode(JSON.stringify(extensions)), MIME.extensions);
    const assets: StoredBlob[] = input.canvas.assets.map((a) => ({
      hash: a.hash,
      mimeType: a.mimeType,
      byteLength: a.bytes.byteLength,
      bytes: a.bytes,
    }));
    const result = await this.repo.commit({
      documentId,
      kind: 'canvas',
      operation: 'save',
      knownHeads: [],
      metadata: {
        kind: 'canvas',
        title,
        folderId: input.folderId ?? null,
        tags: [],
        deleted: false,
      },
      contentRefs: {
        body: scene.hash,
        extensions: sidecar.hash,
        assets: [...new Set(assets.map((a) => a.hash))].sort(),
      },
      blobs: [scene, sidecar, ...assets],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  /**
   * CreateCalendar (DESIGN.md §8): documento `calendar` con sus eventos en JSON. Vive fuera de las
   * carpetas de la biblioteca (folderId null).
   */
  async createCalendar(title: string, color: EventColor): Promise<DocumentRecord> {
    const cleanTitle = validateTitle(title);
    const body = await toBlob(utf8Encode(JSON.stringify(emptyCalendar(color))), MIME.calendar);
    const result = await this.repo.commit({
      documentId: newId(),
      kind: 'calendar',
      operation: 'save',
      knownHeads: [],
      metadata: { kind: 'calendar', title: cleanTitle, folderId: null, tags: [], deleted: false },
      contentRefs: { body: body.hash, extensions: null, assets: [] },
      blobs: [body],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  async openCalendar(documentId: Uuid): Promise<OpenedCalendar> {
    await this.pendingWrites(documentId);
    const { document, head } = await this.loadHead(documentId, 'calendar');
    let parsed: ReturnType<typeof parseCalendar>;
    try {
      parsed = parseCalendar(
        JSON.parse(head.contentRefs.body ? await this.readText(head.contentRefs.body) : '{}'),
      );
    } catch {
      parsed = { calendar: emptyCalendar(), readOnly: 'invalid-content' };
    }
    const readOnly = firstReason(checkRevision(head), parsed.readOnly);
    return {
      document,
      session: this.openSession(documentId, head, readOnly),
      calendar: parsed.calendar,
      readOnly,
    };
  }

  /** SaveCalendar: el calendario entero en una revisión nueva (los eventos se validan antes). */
  saveCalendar(session: EditSession, calendar: CalendarData): Promise<CommitResult> {
    return this.serialized(session.documentId, async () => {
      assertWritable(session);
      const checked: CalendarData = { ...calendar, events: calendar.events.map(validateEvent) };
      const head = await this.currentHead(session);
      const body = await toBlob(utf8Encode(JSON.stringify(checked)), MIME.calendar);
      if (body.hash === head.contentRefs.body) return this.unchanged(session, head);
      return this.commitAndAdvance(session, {
        documentId: session.documentId,
        kind: 'calendar',
        operation: 'save',
        knownHeads: session.knownHeads,
        metadata: { ...head.metadata, kind: 'calendar', deleted: false },
        contentRefs: { body: body.hash, extensions: null, assets: [] },
        blobs: [body],
      });
    });
  }

  /**
   * CreateRichDoc: documento de texto enriquecido (kind `doc`), con el árbol del editor en JSON.
   * Vive en la sección «Documentos», en sus carpetas (`docfolder`).
   */
  async createRichDoc(title: string, folderId: Uuid | null = null): Promise<DocumentRecord> {
    const cleanTitle = validateTitle(title);
    await this.assertFolder(folderId, 'docfolder');
    const body = await toBlob(utf8Encode(JSON.stringify(emptyRichDoc())), MIME.richDoc);
    const result = await this.repo.commit({
      documentId: newId(),
      kind: 'doc',
      operation: 'save',
      knownHeads: [],
      metadata: { kind: 'doc', title: cleanTitle, folderId, tags: [], deleted: false },
      contentRefs: { body: body.hash, extensions: null, assets: [] },
      blobs: [body],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  /**
   * CreateMarkdownDoc: documento Markdown de la sección «Documentos» (kind `mddoc`), editado con
   * Milkdown. Mismo formato que una nota (frontmatter y cuerpo, copia legible); se abre y guarda
   * con openNote/saveNote.
   */
  async createMarkdownDoc(title: string, folderId: Uuid | null = null): Promise<DocumentRecord> {
    const cleanTitle = validateTitle(title);
    await this.assertFolder(folderId, 'docfolder');
    const documentId = newId();
    const body = await toBlob(
      utf8Encode(this.noteMarkdown(documentId, cleanTitle, [], '')),
      MIME.markdown,
    );
    const result = await this.repo.commit({
      documentId,
      kind: 'mddoc',
      operation: 'save',
      knownHeads: [],
      metadata: { kind: 'mddoc', title: cleanTitle, folderId, tags: [], deleted: false },
      contentRefs: { body: body.hash, extensions: null, assets: [] },
      blobs: [body],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  async openRichDoc(documentId: Uuid): Promise<OpenedRichDoc> {
    await this.pendingWrites(documentId);
    const { document, head } = await this.loadHead(documentId, 'doc');
    let parsed: ReturnType<typeof parseRichDoc>;
    try {
      parsed = parseRichDoc(
        JSON.parse(head.contentRefs.body ? await this.readText(head.contentRefs.body) : '{}'),
      );
    } catch {
      parsed = { doc: emptyRichDoc(), readOnly: 'invalid-content' };
    }
    const readOnly = firstReason(checkRevision(head), parsed.readOnly);
    return {
      document,
      session: this.openSession(documentId, head, readOnly),
      doc: parsed.doc,
      readOnly,
    };
  }

  /**
   * SaveRichDoc: el documento entero en una revisión nueva. Las claves que el editor no conoce
   * se conservan (`preserved`, lo leído al abrir), como en las notas y los calendarios.
   */
  saveRichDoc(
    session: EditSession,
    content: RichDocData['content'],
    preserved?: RichDocData,
    newAssets: CanvasAsset[] = [],
  ): Promise<CommitResult> {
    return this.serialized(session.documentId, async () => {
      assertWritable(session);
      const parsed = parseRichDoc({ ...(preserved ?? emptyRichDoc()), content });
      if (parsed.readOnly) throw new DomainError('invalid-content', 'Documento con forma inválida');
      const head = await this.currentHead(session);
      const body = await toBlob(utf8Encode(JSON.stringify(parsed.doc)), MIME.richDoc);
      if (body.hash === head.contentRefs.body) return this.unchanged(session, head);
      return this.commitAndAdvance(session, {
        documentId: session.documentId,
        kind: 'doc',
        operation: 'save',
        knownHeads: session.knownHeads,
        metadata: { ...head.metadata, kind: 'doc', deleted: false },
        // Las imágenes de todas las pestañas.
        ...(await this.withAssets(
          [...new Set(docTabs(parsed.doc).flatMap((tab) => richDocAssetRefs(tab.content)))].sort(),
          head,
          newAssets,
          body,
        )),
      });
    });
  }

  /**
   * CreateTemplate: plantilla del lienzo a partir de una selección ya serializada por el
   * adaptador (escena .excalidraw y sus imágenes como assets). Es inmutable en su contenido: se
   * renombra o se envía a la papelera como cualquier documento.
   */
  async createTemplate(input: {
    title: string;
    canvas: SerializedCanvas;
  }): Promise<DocumentRecord> {
    const title = validateTitle(input.title);
    for (const asset of input.canvas.assets) {
      if ((await sha256Hex(asset.bytes)) !== asset.hash) {
        throw new DomainError(
          'invalid-content',
          'Un adjunto de la plantilla no coincide con su hash',
        );
      }
    }
    const scene = await toBlob(utf8Encode(input.canvas.sceneJson), MIME.excalidraw);
    const assets: StoredBlob[] = input.canvas.assets.map((a) => ({
      hash: a.hash,
      mimeType: a.mimeType,
      byteLength: a.bytes.byteLength,
      bytes: a.bytes,
    }));
    const result = await this.repo.commit({
      documentId: newId(),
      kind: 'template',
      operation: 'save',
      knownHeads: [],
      metadata: { kind: 'template', title, folderId: null, tags: [], deleted: false },
      contentRefs: {
        body: scene.hash,
        extensions: null,
        assets: [...new Set(assets.map((a) => a.hash))].sort(),
      },
      blobs: [scene, ...assets],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  async openTemplate(documentId: Uuid): Promise<OpenedTemplate> {
    await this.pendingWrites(documentId);
    const { document, head } = await this.loadHead(documentId, 'template');
    const sceneJson = head.contentRefs.body ? await this.readText(head.contentRefs.body) : '{}';
    return {
      document,
      sceneJson,
      readOnly: firstReason(checkRevision(head), checkSceneVersion(sceneJson)),
    };
  }

  /**
   * Markdown de la versión vigente tal como se guarda (frontmatter + cuerpo, diseño §12.1).
   * Espera a los guardados pendientes para no exportar una versión anterior.
   */
  /** Contenido vigente de un documento con formato, para exportarlo (sin sesión de edición). */
  async exportRichDoc(documentId: Uuid): Promise<RichDocData> {
    await this.pendingWrites(documentId);
    const { head } = await this.loadHead(documentId, 'doc');
    if (!head.contentRefs.body) return emptyRichDoc();
    try {
      return parseRichDoc(JSON.parse(await this.readText(head.contentRefs.body))).doc;
    } catch {
      throw new DomainError('invalid-content', 'Documento con formato ilegible');
    }
  }

  async exportNoteMarkdown(documentId: Uuid): Promise<string> {
    await this.pendingWrites(documentId);
    const { head } = await this.loadHead(documentId, isMarkdownKind);
    if (!head.contentRefs.body) throw new DomainError('not-found', 'Nota sin contenido');
    return this.readText(head.contentRefs.body);
  }

  async openNote(documentId: Uuid): Promise<OpenedNote> {
    await this.pendingWrites(documentId);
    // Notas y documentos Markdown (Milkdown) comparten formato: frontmatter y cuerpo.
    const { document, head } = await this.loadHead(documentId, isMarkdownKind);
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
  /**
   * `newAssets`: imágenes añadidas en el editor (documentos Markdown, fase 8.4). Solo se guardan
   * las que el cuerpo cita; las citadas que ya están en el almacén no hace falta volver a darlas.
   */
  saveNote(
    session: EditSession,
    body: string,
    newAssets: CanvasAsset[] = [],
  ): Promise<CommitResult> {
    return this.serialized(session.documentId, () => this.saveNoteNow(session, body, newAssets));
  }

  private async saveNoteNow(
    session: EditSession,
    body: string,
    newAssets: CanvasAsset[],
  ): Promise<CommitResult> {
    assertWritable(session);
    const head = await this.currentHead(session);
    const { title, tags } = head.metadata;
    const markdown = await toBlob(
      utf8Encode(this.noteMarkdown(session.documentId, title, tags, body)),
      MIME.markdown,
    );
    if (markdown.hash === head.contentRefs.body) return this.unchanged(session, head);
    const kind = isMarkdownKind(head.metadata.kind) ? head.metadata.kind : 'note';
    return this.commitAndAdvance(session, {
      documentId: session.documentId,
      kind,
      operation: 'save',
      knownHeads: session.knownHeads,
      metadata: { ...head.metadata, kind, deleted: false },
      ...(await this.withAssets(markdownAssetRefs(body), head, newAssets, markdown)),
    });
  }

  /**
   * Imágenes de un documento (fase 8.4): las citadas que existen (en la revisión anterior, entre
   * las nuevas o ya en el almacén). Una cita a una imagen que no existe (texto escrito a mano,
   * edición externa) se ignora en lugar de impedir el guardado.
   */
  private async withAssets(
    refs: string[],
    head: Revision,
    newAssets: CanvasAsset[],
    body: StoredBlob,
  ): Promise<{ contentRefs: ContentRefs; blobs: StoredBlob[] }> {
    const provided = new Map(newAssets.map((a) => [a.hash, a]));
    const known = new Set(head.contentRefs.assets);
    const assets: string[] = [];
    const blobs: StoredBlob[] = [body];
    for (const hash of refs) {
      const fresh = provided.get(hash);
      if (fresh) {
        blobs.push({
          hash,
          mimeType: fresh.mimeType,
          byteLength: fresh.bytes.byteLength,
          bytes: fresh.bytes,
        });
        assets.push(hash);
      } else if (known.has(hash) || (await this.repo.getBlob(hash))) {
        assets.push(hash);
      }
    }
    return { contentRefs: { body: body.hash, extensions: null, assets }, blobs };
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
    return this.commitAndAdvance(session, {
      documentId: session.documentId,
      kind: 'canvas',
      operation: 'save',
      knownHeads: session.knownHeads,
      metadata: { ...head.metadata, kind: 'canvas', deleted: false },
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
      const moving = documents.find((d) => d.id === documentId);
      // Solo a una carpeta de su misma sección («Notas» o «Documentos»).
      if (!target || target.deleted || !moving || target.kind !== folderKindFor(moving.kind)) {
        throw new DomainError('not-found', 'Carpeta de destino no encontrada');
      }
      if (wouldCreateCycle(documents, documentId, folderId)) {
        throw new DomainError('invalid-title', 'Una carpeta no puede contenerse a sí misma');
      }
    }
    return this.updateMetadata(documentId, { folderId });
  }

  /**
   * Orden manual de la barra lateral (desde el 17/10/2026): aplica las claves nuevas de
   * `planReorder` y, si se suelta en otra carpeta, la mueve. Cada documento que cambia recibe una
   * revisión de metadatos; los que no cambian, ninguna.
   */
  async reorderDocuments(
    changes: ReadonlyMap<Uuid, string>,
    move?: { documentId: Uuid; folderId: Uuid | null },
  ): Promise<void> {
    if (move) await this.moveDocument(move.documentId, move.folderId);
    for (const [documentId, sortKey] of changes) {
      await this.updateMetadata(documentId, { sortKey });
    }
  }

  /**
   * Archivar (desde el 17/10/2026): sale de la barra lateral, de Recientes y de los selectores de
   * enlaces, pero sigue en la búsqueda y sus enlaces funcionan. No es la papelera: no hay borrado.
   */
  setArchived(documentId: Uuid, archived: boolean): Promise<CommitResult> {
    return this.updateMetadata(documentId, { archived });
  }

  /** CreateFolder: entidad revisionada, sin contenido (diseño §5). */
  /** Carpeta de «Notas» (`folder`) o de «Documentos» (`docfolder`); cada sección tiene su árbol. */
  async createFolder(
    title: string,
    parentId: Uuid | null = null,
    kind: 'folder' | 'docfolder' = 'folder',
  ): Promise<DocumentRecord> {
    const cleanTitle = validateTitle(title);
    await this.assertFolder(parentId, kind);
    const result = await this.repo.commit({
      documentId: newId(),
      kind,
      operation: 'save',
      knownHeads: [],
      metadata: { kind, title: cleanTitle, folderId: parentId, tags: [], deleted: false },
      contentRefs: { body: null, extensions: null, assets: [] },
      blobs: [],
    });
    for (const listener of this.listeners) listener(result);
    return result.document;
  }

  private updateMetadata(documentId: Uuid, patch: MetadataPatch): Promise<CommitResult> {
    return this.serialized(documentId, async () =>
      this.metadataNow(await this.sessionFor(documentId), patch),
    );
  }

  /**
   * Revisión de metadatos (diseño §5.1): conserva el UUID y el contenido; en notas vuelve a
   * serializar el frontmatter para que coincida con los metadatos nuevos.
   */
  private async metadataNow(session: EditSession, patch: MetadataPatch): Promise<CommitResult> {
    assertWritable(session);
    const head = await this.currentHead(session);
    const doc = await this.requireDocument(session.documentId);
    const title = patch.title ?? head.metadata.title;
    const tags = patch.tags ?? head.metadata.tags;
    const folderId = patch.folderId === undefined ? head.metadata.folderId : patch.folderId;
    let contentRefs = head.contentRefs;
    const blobs: StoredBlob[] = [];

    if (isMarkdownKind(doc.kind)) {
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
      metadata: withOptional(
        {
          ...head.metadata,
          kind: doc.kind,
          title,
          tags: dedupeTags(tags),
          folderId,
          deleted: head.metadata.deleted,
        },
        patch,
      ),
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

  /** Espacio de las versiones de un documento y lo que liberaría eliminar cada una (RF-46). */
  versionSpace(documentId: Uuid): Promise<VersionSpace> {
    return this.repo.versionSpace(documentId);
  }

  /**
   * Elimina versiones concretas de un documento (RF-46, CA-32), por acción explícita (RN-13).
   * Las cabezas nunca se eliminan; espera a lo pendiente del documento antes de retirar nada.
   */
  async pruneVersions(documentId: Uuid, revisionIds: Uuid[]): Promise<PurgeResult> {
    await this.pendingWrites(documentId);
    return this.repo.pruneRevisions(documentId, revisionIds);
  }

  listHistory(documentId: Uuid): Promise<HistoryEntry[]> {
    return this.repo.listHistory(documentId);
  }

  async previewRevision(revisionId: Uuid): Promise<RevisionPreview> {
    const revision = await this.repo.getRevision(revisionId);
    if (!revision) throw new DomainError('not-found', 'Revisión no encontrada');
    const text = revision.contentRefs.body ? await this.readText(revision.contentRefs.body) : null;
    if (isMarkdownKind(revision.metadata.kind)) {
      return { kind: 'note', revision, body: parseNoteMarkdown(text ?? '').body };
    }
    if (revision.metadata.kind === 'calendar') {
      let calendar: CalendarData;
      try {
        calendar = parseCalendar(JSON.parse(text ?? '{}')).calendar;
      } catch {
        calendar = emptyCalendar();
      }
      return { kind: 'calendar', revision, calendar };
    }
    if (revision.metadata.kind === 'doc') {
      let doc: RichDocData;
      try {
        doc = parseRichDoc(JSON.parse(text ?? '{}')).doc;
      } catch {
        doc = emptyRichDoc();
      }
      return { kind: 'doc', revision, doc };
    }
    return { kind: 'canvas', revision, sceneJson: text };
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
      if (choice.kind === 'merge-events') {
        if (doc.kind !== 'calendar')
          throw new DomainError('not-found', 'Solo se fusionan calendarios');
        const versions: CalendarData[] = [];
        let latest: Revision | null = null;
        for (const head of await this.conflictHeads(documentId)) {
          const parsed = parseCalendar(
            JSON.parse(head.contentRefs.body ? await this.readText(head.contentRefs.body) : '{}'),
          );
          // Una versión que esta aplicación no puede leer no se toca ni se mezcla.
          if (parsed.readOnly) {
            throw new DomainError(
              'unsupported-version',
              'Una versión del calendario no es legible',
            );
          }
          versions.push(parsed.calendar);
          latest = head;
        }
        const merged: CalendarData = mergeCalendars(versions);
        merged.events = merged.events.map(validateEvent);
        const body = await toBlob(utf8Encode(JSON.stringify(merged)), MIME.calendar);
        input = {
          documentId,
          kind: 'calendar',
          operation: 'resolve',
          knownHeads: heads,
          metadata: { ...latest!.metadata, deleted: false },
          contentRefs: { body: body.hash, extensions: null, assets: [] },
          blobs: [body],
        };
      } else if (choice.kind === 'merge') {
        if (!isMarkdownKind(doc.kind)) throw new DomainError('not-found', 'Solo se combinan notas');
        const base = (await this.conflictHeads(documentId)).at(-1)!;
        const markdown = await toBlob(
          utf8Encode(
            this.noteMarkdown(documentId, base.metadata.title, base.metadata.tags, choice.body),
          ),
          MIME.markdown,
        );
        input = {
          documentId,
          kind: doc.kind,
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
    if (isMarkdownKind(source.metadata.kind)) {
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
    const kind =
      source.metadata.kind === 'note' ||
      source.metadata.kind === 'calendar' ||
      source.metadata.kind === 'doc' ||
      source.metadata.kind === 'mddoc'
        ? source.metadata.kind
        : 'canvas';
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
      if (!doc || !isMarkdownKind(doc.kind) || parent?.documentId !== documentId) return null;
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
        kind: doc.kind,
        operation: 'external',
        knownHeads: [parentRevisionId],
        metadata: { ...parent.metadata, title, tags, deleted: false },
        contentRefs: {
          body: blob.hash,
          extensions: null,
          // La copia legible solo cita las imágenes: se conservan las que siguen citadas.
          assets: markdownAssetRefs(parsed.body).filter((h) =>
            parent.contentRefs.assets.includes(h),
          ),
        },
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
    kind?: RevisionKind | ((kind: RevisionKind) => boolean),
  ): Promise<{ document: DocumentRecord; head: Revision }> {
    const document = await this.requireDocument(documentId);
    const matches =
      kind === undefined ||
      (typeof kind === 'function' ? kind(document.kind) : document.kind === kind);
    if (!matches) throw new DomainError('not-found', 'Tipo de documento distinto');
    // Con varias cabezas (conflicto) se abre la más reciente; la UI de resolución está pendiente.
    const heads = await this.repo.getHeads(documentId);
    const head = heads.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    if (!head) throw new DomainError('not-found', 'Documento sin revisiones');
    return { document, head };
  }

  /** Una carpeta de destino (o null, la raíz) debe existir, estar viva y ser del tipo pedido. */
  private async assertFolder(folderId: Uuid | null, kind: 'folder' | 'docfolder'): Promise<void> {
    if (!folderId) return;
    const folder = await this.repo.getDocument(folderId);
    if (folder?.kind !== kind || folder.deleted) {
      throw new DomainError('not-found', 'Carpeta no encontrada');
    }
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
    // Fondo «papel» del sistema de diseño (docs/DESIGN.md §3.2); en oscuro el motor lo invierte.
    appState: { viewBackgroundColor: '#FFFDF4' },
    files: {},
  });
}
