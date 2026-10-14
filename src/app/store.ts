import { create } from 'zustand';
import type { DocumentRecord } from '../domain/revision.ts';
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
}

/**
 * Orden de la cabecera para la vista abierta, que es quien tiene el motor o el editor: exportar
 * el documento o abrir la ayuda de atajos del lienzo. `seq` distingue dos órdenes iguales.
 */
export interface ViewCommand {
  seq: number;
  documentId: string;
  kind: 'export' | 'help';
}

interface UiState {
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
  consumeFocus: (documentId: string) => FocusTarget | null;
  setSaveStatus: (status: UiSaveStatus, errorCode?: string | null) => void;
  toggleLibrary: () => void;
  bumpKnowledge: () => void;
  setIndexing: (indexing: { done: number; total: number } | null) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  documents: [],
  activeId: null,
  saveStatus: 'idle',
  errorCode: null,
  libraryOpen: true,
  focus: null,
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
  setActive: (activeId) => set({ activeId }),
  navigate: (focus) => set({ activeId: focus.documentId, focus }),
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
