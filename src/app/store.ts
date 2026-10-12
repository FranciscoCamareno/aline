import { create } from 'zustand';
import type { DocumentRecord } from '../domain/revision.ts';
import type { PersistenceStatus } from '../ports/RemoteStore.ts';

/**
 * Estado de interfaz (diseño §3): selección, paneles y estado visual. No es la fuente de verdad
 * del contenido; la lista de documentos es una copia de lo leído de IndexedDB.
 */
export type UiSaveStatus = PersistenceStatus | 'idle';

interface UiState {
  documents: DocumentRecord[];
  activeId: string | null;
  saveStatus: UiSaveStatus;
  errorCode: string | null;
  libraryOpen: boolean;
  setDocuments: (documents: DocumentRecord[]) => void;
  upsertDocument: (document: DocumentRecord) => void;
  setActive: (id: string | null) => void;
  setSaveStatus: (status: UiSaveStatus, errorCode?: string | null) => void;
  toggleLibrary: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  documents: [],
  activeId: null,
  saveStatus: 'idle',
  errorCode: null,
  libraryOpen: true,
  setDocuments: (documents) => set({ documents }),
  upsertDocument: (document) =>
    set((state) => ({
      documents: [document, ...state.documents.filter((d) => d.id !== document.id)],
    })),
  setActive: (activeId) => set({ activeId }),
  setSaveStatus: (saveStatus, errorCode = null) => set({ saveStatus, errorCode }),
  toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),
}));
