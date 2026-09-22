/**
 * FlowNote 编辑器 API 接口
 */
export interface BrowserBundleEditorSnapshot {
  markdown: string;
  protected: boolean;
  reasons: string[];
  bodyHtml: string;
}

export interface FlowNoteEditorApi {
  /**
   * 获取当前 Markdown 内容
   */
  getMarkdown(): string;

  /**
   * Capture a read-only Browser Bundle source snapshot.
   * Protected/source-mode documents return Markdown fidelity fallback data instead of stale visual DOM.
   */
  getBrowserBundleSnapshot(): BrowserBundleEditorSnapshot;

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(markdown: string): void;

  /**
   * 返回当前可视化文档中的图片节点地址
   */
  getImageSources(): string[];

  /**
   * 生成插入 HTML Block 后的候选 Markdown，不修改实时文档；可同时重写真实图片节点路径
   */
  previewHtmlBlock(id: string, width?: 'normal' | 'wide' | 'full', imageReplacements?: Record<string, string>): string;

  /**
   * 生成 Deep Copy 候选 Markdown：新 Block 紧随源 Block，不修改实时编辑器
   */
  previewDuplicateHtmlBlock(sourceId: string, targetId: string): string;

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
   * 将第 index 个 H1-H3 标题滚动到编辑区并定位光标；源码保护模式下返回 false。
   */
  revealHeading(index: number): boolean;

  /**
   * 设置编辑模式
   */
  setMode(mode: 'edit' | 'read' | 'source'): void;
}

/**
 * 编辑模式
 */
export type EditorMode = 'edit' | 'read' | 'source';
