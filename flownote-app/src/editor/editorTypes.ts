/**
 * FlowNote 编辑器 API 接口
 */
export interface FlowNoteEditorApi {
  /**
   * 获取当前 Markdown 内容
   */
  getMarkdown(): string;

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(markdown: string): void;

  /**
   * 插入 HTML Block
   */
  insertHtmlBlock(id: string, width?: 'normal' | 'wide' | 'full'): void;

  /**
   * 插入图片
   */
  insertImage(path: string, alt?: string): void;

  /**
   * 聚焦编辑器
   */
  focus(): void;

  /**
   * 设置编辑模式
   */
  setMode(mode: 'edit' | 'read' | 'source'): void;
}

/**
 * 编辑模式
 */
export type EditorMode = 'edit' | 'read' | 'source';
