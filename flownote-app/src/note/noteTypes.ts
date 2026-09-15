/**
 * FlowNote 核心数据类型定义
 */
import type { MixedNoteData } from './mixedTypes';

/**
 * Note 类型
 */
export type NoteType = 'markdown' | 'mixed';

/**
 * Note 元数据
 */
export interface NoteMetadata {
  version: number;
  title: string;
  type: NoteType;
  createdAt: string;
  updatedAt: string;
}

/**
 * HTML Block 配置
 */
export interface HtmlBlock {
  id: string;
  src: string;
  width: 'normal' | 'wide' | 'full';
}

/**
 * Note 文件结构
 */
export interface NoteStructure {
  path: string;
  metadata: NoteMetadata;
  contentMd: string;
  htmlBlocks: Map<string, string>; // id -> html content
  assets: string[];
  mixed?: MixedNoteData;
}

/**
 * 编辑器状态
 */
export interface EditorState {
  currentNote: NoteStructure | null;
  isDirty: boolean;
  isComposing: boolean; // IME 输入中
}
