import { create } from 'zustand';
import { NoteStructure } from './noteTypes';

interface NoteStore {
  currentNote: NoteStructure | null;
  isDirty: boolean;
  isComposing: boolean;

  setCurrentNote: (note: NoteStructure | null) => void;
  setDirty: (dirty: boolean) => void;
  setComposing: (composing: boolean) => void;
  updateContent: (markdown: string) => void;
  addHtmlBlock: (id: string, content: string) => void;
}

export const useNoteStore = create<NoteStore>((set) => ({
  currentNote: null,
  isDirty: false,
  isComposing: false,

  setCurrentNote: (note) => set({ currentNote: note, isDirty: false }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  setComposing: (composing) => set({ isComposing: composing }),

  updateContent: (markdown) =>
    set((state) => {
      if (!state.currentNote) return state;
      return {
        currentNote: {
          ...state.currentNote,
          contentMd: markdown,
        },
        isDirty: true,
      };
    }),

  addHtmlBlock: (id, content) =>
    set((state) => {
      if (!state.currentNote) return state;
      const newBlocks = new Map(state.currentNote.htmlBlocks);
      newBlocks.set(id, content);
      return {
        currentNote: {
          ...state.currentNote,
          htmlBlocks: newBlocks,
        },
        isDirty: true,
      };
    }),
}));
