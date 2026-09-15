import { create } from 'zustand';
import { NoteStructure } from './noteTypes';
import type { HtmlBlockData } from './mixedTypes';
import { validBlockId, validateHtmlSource } from './htmlBlockData';

interface NoteStore {
  currentNote: NoteStructure | null;
  isDirty: boolean;
  isComposing: boolean;

  setCurrentNote: (note: NoteStructure | null) => void;
  setDirty: (dirty: boolean) => void;
  setComposing: (composing: boolean) => void;
  updateContent: (markdown: string) => void;
  addHtmlBlock: (id: string, content: string) => void;
  setHtmlBlock: (block: HtmlBlockData) => void;
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
      if (!state.currentNote || state.currentNote.contentMd === markdown) return state;
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
  setHtmlBlock: block => set(state => {
    const note = state.currentNote;
    if (!note?.mixed || note.mixed.metadata.formatVersion !== 1) throw new Error('当前笔记不是可编辑的 Mixed Note');
    if (!validBlockId(block.id)) throw new Error('HTML Block ID 无效');
    validateHtmlSource(block.html);
    const previous = note.mixed.blocks.find(value => value.id === block.id);
    if (previous && previous.originalHtml !== block.originalHtml) throw new Error('普通编辑不能覆盖 Original HTML');
    const blocks = previous ? note.mixed.blocks.map(value => value.id === block.id ? block : value) : [...note.mixed.blocks, block];
    const htmlBlocks = new Map(note.htmlBlocks).set(block.id, block.html);
    return { currentNote: { ...note, htmlBlocks, mixed: { ...note.mixed, blocks } }, isDirty: true };
  }),
}));
