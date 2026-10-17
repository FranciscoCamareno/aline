import { create } from 'zustand';
import type { InternalTarget, TextSelector } from '../domain/links.ts';
import { isContentKind, isDocsKind, type DocumentRecord } from '../domain/revision.ts';
import type { PersistenceStatus } from '../ports/RemoteStore.ts';
import type { RemoteStatus } from './syncRuntime.ts';

/**
 * Estado de interfaz (diseño §3): selección, paneles y estado visual. No es la fuente de verdad
 * del contenido; la lista de documentos es una copia de lo leído de IndexedDB.
 */
export type UiSaveStatus = PersistenceStatus | 'idle';

/** Destino al abrir un documento desde un enlace, un backlink o la búsqueda. */
export interface FocusTarget {
  documentId: string;
  /** Lienzos: elemento a centrar y resaltar. */
  elementId?: string | null;
  /** Notas: texto a seleccionar. */
  text?: string | null;
  /** Calendarios: evento que se abre. */
  eventId?: string | null;
  /** Documentos con formato: bloque anclado (`#b=`). */
  blockId?: string | null;
  /** Notas y documentos: cita textual que se selecciona (`#t=`). */
  quote?: TextSelector | null;
}

/** Enlace copiado con «Copiar enlace a la selección», para «Enlazar con lo copiado». */
export interface CopiedLink {
  url: string;
  /** Texto del enlace si se inserta sin selección: la cita o el título del evento. */
  label: string;
  /** Título del documento de destino, para reconocerlo en el selector. */
  documentTitle: string;
  /** Distingue dos copias iguales (el aviso de «copiado» se muestra en cada una). */
  seq: number;
}

/** Destino de la navegación al seguir un enlace interno. */
export function linkFocus(target: InternalTarget): FocusTarget {
  return {
    documentId: target.documentId,
    elementId: target.elementId,
    eventId: target.eventId,
    blockId: target.blockId,
    quote: target.text,
  };
}

/**
 * Orden de la cabecera para la vista abierta, que es quien tiene el motor o el editor: exportar
 * el documento. `seq` distingue dos órdenes iguales.
 */
export interface ViewCommand {
  seq: number;
  documentId: string;
  kind: 'export';
}

/**
 * Sección de la barra lateral: «Notas» (`library`: lienzos y notas), calendario o «Documentos»
 * (documentos con formato `doc` y Markdown `mddoc`).
 */
export type Section = 'library' | 'calendar' | 'documents';

/**
 * Sección en la que se abre un documento: los documentos (Tiptap y Milkdown) en «Documentos»;
 * notas y lienzos en «Notas» (la biblioteca).
 */
function sectionFor(documents: readonly DocumentRecord[], id: string): Section {
  const kind = documents.find((d) => d.id === id)?.kind;
  return kind && isDocsKind(kind) ? 'documents' : 'library';
}

interface UiState {
  section: Section;
  /**
   * Modo Zen del lienzo (el del motor): mientras está activo, la aplicación oculta la barra
   * lateral y la cabecera. Lo fija la vista del lienzo; al salir del lienzo vuelve a false.
   */
  zen: boolean;
  setZen: (zen: boolean) => void;
  setSection: (section: Section) => void;
  documents: DocumentRecord[];
  activeId: string | null;
  saveStatus: UiSaveStatus;
  errorCode: string | null;
  libraryOpen: boolean;
  focus: FocusTarget | null;
  /** Cambia cada vez que se actualizan los índices de enlaces y búsqueda. */
  knowledgeVersion: number;
  /** Progreso del indexado inicial; null cuando la búsqueda está lista. */
  indexing: { done: number; total: number } | null;
  /** Destino conectado (carpeta) y su estado; null si el almacén solo está en el navegador. */
  remote: RemoteStatus | null;
  /** Carpeta elegida en la biblioteca: destino de lo nuevo y de la exportación de Markdown. */
  selectedFolder: string | null;
  setSelectedFolder: (id: string | null) => void;
  viewCommand: ViewCommand | null;
  sendViewCommand: (documentId: string, kind: ViewCommand['kind']) => void;
  setRemote: (remote: RemoteStatus | null) => void;
  setDocuments: (documents: DocumentRecord[]) => void;
  upsertDocument: (document: DocumentRecord) => void;
  removeDocument: (id: string) => void;
  setActive: (id: string | null) => void;
  /** Abre un documento y, si se indica, centra un elemento o selecciona un texto. */
  navigate: (target: FocusTarget) => void;
  /** Portapapeles interno de enlaces: solo en memoria, nunca en el del sistema. */
  copiedLink: CopiedLink | null;
  copyLink: (link: Omit<CopiedLink, 'seq'>) => void;
  consumeFocus: (documentId: string) => FocusTarget | null;
  setSaveStatus: (status: UiSaveStatus, errorCode?: string | null) => void;
  toggleLibrary: () => void;
  bumpKnowledge: () => void;
  setIndexing: (indexing: { done: number; total: number } | null) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  section: 'library',
  zen: false,
  setZen: (zen) => set((state) => (state.zen === zen ? state : { zen })),
  // Al entrar en una sección, si el documento abierto es de otra, se abre su más reciente.
  setSection: (section) =>
    set((state) => {
      if (section === 'calendar') return { section };
      const active = state.documents.find((d) => d.id === state.activeId);
      if (active && sectionFor(state.documents, active.id) === section) return { section };
      const recent = state.documents.find(
        (d) => !d.deleted && (section === 'documents' ? isDocsKind(d.kind) : isContentKind(d.kind)),
      );
      return { section, activeId: recent?.id ?? null };
    }),
  documents: [],
  activeId: null,
  saveStatus: 'idle',
  errorCode: null,
  libraryOpen: true,
  focus: null,
  copiedLink: null,
  copyLink: (link) =>
    set((state) => ({ copiedLink: { ...link, seq: (state.copiedLink?.seq ?? 0) + 1 } })),
  knowledgeVersion: 0,
  indexing: null,
  remote: null,
  selectedFolder: null,
  setSelectedFolder: (selectedFolder) => set({ selectedFolder }),
  viewCommand: null,
  sendViewCommand: (documentId, kind) =>
    set((state) => ({ viewCommand: { seq: (state.viewCommand?.seq ?? 0) + 1, documentId, kind } })),
  setRemote: (remote) => set({ remote }),
  setDocuments: (documents) => set({ documents }),
  upsertDocument: (document) =>
    set((state) => ({
      documents: [document, ...state.documents.filter((d) => d.id !== document.id)],
    })),
  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    })),
  // Abrir un documento lleva a su sección (biblioteca o documentos).
  setActive: (activeId) =>
    set((state) =>
      activeId ? { activeId, section: sectionFor(state.documents, activeId) } : { activeId },
    ),
  // Un calendario no se «abre»: se va a la sección del calendario y la vista aplica el foco.
  navigate: (focus) =>
    set((state) =>
      state.documents.find((d) => d.id === focus.documentId)?.kind === 'calendar'
        ? { focus, section: 'calendar' }
        : {
            activeId: focus.documentId,
            focus,
            section: sectionFor(state.documents, focus.documentId),
          },
    ),
  consumeFocus: (documentId) => {
    const focus = get().focus;
    if (focus?.documentId !== documentId) return null;
    set({ focus: null });
    return focus;
  },
  setSaveStatus: (saveStatus, errorCode = null) => set({ saveStatus, errorCode }),
  toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),
  bumpKnowledge: () => set((state) => ({ knowledgeVersion: state.knowledgeVersion + 1 })),
  setIndexing: (indexing) => set({ indexing }),
}));
