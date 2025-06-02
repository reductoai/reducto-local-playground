import { create } from "zustand";

interface DocumentStore {
  currentDocument: File | null;
  setDocument: (file: File | null) => void;
  clearDocument: () => void;
  hasDocument: () => boolean;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  currentDocument: null,

  setDocument: (file: File | null) => {
    set({ currentDocument: file });
  },

  clearDocument: () => {
    set({ currentDocument: null });
  },

  hasDocument: () => {
    return get().currentDocument !== null;
  },
}));

// Helper functions for compatibility with existing code
export const saveDocumentToStore = (file: File) => {
  useDocumentStore.getState().setDocument(file);
};

export const loadDocumentFromStore = (): File | null => {
  return useDocumentStore.getState().currentDocument;
};

export const clearDocumentFromStore = () => {
  useDocumentStore.getState().clearDocument();
};

export const hasStoredDocument = (): boolean => {
  return useDocumentStore.getState().hasDocument();
};
