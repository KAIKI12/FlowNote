import type { EditorMode } from './editorTypes';
import type { MarkdownBridge } from './markdownBridge';
import { displaySource, SourceBuffer } from './sourceBuffer';

const PROTECTION_RECHECK_MS = 150;
export type AcquireEditorReadLock = () => () => void;

export interface SessionSnapshot {
  ready: boolean;
  readLocked: boolean;
  mode: EditorMode;
  active: 'visual' | 'source';
  source: string;
  reasons: string[];
  composing: boolean;
  conflict: string | null;
  notice: string;
  focusRevision: number;
  caret?: number;
}
interface SessionOptions {
  source: string;
  mode: EditorMode;
  publish: (source: string) => void;
  dirty: () => void;
  composing: (value: boolean) => void;
}

export class EditorSession {
  private state: SessionSnapshot;
  private listeners = new Set<() => void>();
  private bridge?: MarkdownBridge;
  private buffer: SourceBuffer;
  private preferredMode: EditorMode;
  private lastExternal: string;
  private lastPublished?: string;
  private installing = false;
  private compositionBase = '';
  private pendingExternal: string | null = null;
  private inspectionTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: SessionOptions) {
    this.preferredMode = options.mode;
    this.lastExternal = options.source;
    this.buffer = new SourceBuffer(options.source);
    this.state = { ready: false, readLocked: false, mode: options.mode, active: 'source', source: options.source,
      reasons: [], composing: false, conflict: null, notice: '', focusRevision: 0 };
  }

  getSnapshot = (): SessionSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<SessionSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  private requireBridge(): MarkdownBridge {
    if (!this.bridge || !this.state.ready) throw new Error('编辑器尚未准备就绪');
    return this.bridge;
  }

  acquireReadLock(): () => void {
    if (this.state.composing) throw new Error('请先完成组合输入');
    if (this.state.readLocked) throw new Error('编辑器已锁定');
    this.update({ readLocked: true, mode: 'read' });
    this.bridge?.editable(false);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      const mode = this.requestedMode(this.state.active);
      this.update({ readLocked: false, mode });
      this.bridge?.editable(this.state.active === 'visual' && mode === 'edit');
    };
  }

  private requestedMode(active: SessionSnapshot['active']): EditorMode {
    return this.preferredMode === 'read' ? 'read' : active === 'source' ? 'source' : 'edit';
  }

  connect(bridge: MarkdownBridge): void {
    this.bridge = bridge;
    this.state = { ...this.state, ready: true };
    this.install(this.state.source, true);
  }

  disconnect(identity: unknown): void {
    if (this.bridge?.identity !== identity) return;
    this.cancelInspection();
    this.bridge = undefined;
    this.options.composing(false);
    this.update({ ready: false, composing: false });
  }

  getMarkdown(): string {
    const bridge = this.requireBridge();
    return this.state.active === 'source' ? this.state.source : bridge.read();
  }

  private publish(): void {
    const source = this.getMarkdown();
    if (this.state.composing || source === this.lastPublished) return;
    this.lastPublished = source;
    this.options.publish(source);
  }

  private install(source: string, resetHistory = false): void {
    this.cancelInspection();
    const bridge = this.requireBridge();
    let reasons = bridge.inspect(source);
    let active: SessionSnapshot['active'] = reasons.length || this.preferredMode === 'source' ? 'source' : 'visual';
    this.installing = true;
    try {
      if (active === 'visual') bridge.replace(source, resetHistory || this.state.active === 'source');
    } catch (error) {
      active = 'source';
      reasons = [`无法打开可视化编辑：${error instanceof Error ? error.message : String(error)}`];
    } finally { this.installing = false; }
    const mode = this.state.readLocked ? 'read' : this.requestedMode(active);
    this.buffer = new SourceBuffer(source);
    this.lastPublished = undefined;
    bridge.editable(active === 'visual' && mode === 'edit');
    this.update({ source, reasons, active, mode, conflict: null, notice: '' });
  }

  setMarkdown(source: string): void {
    if (typeof source !== 'string') throw new TypeError('Markdown 内容必须是字符串');
    this.requireBridge();
    if (this.state.readLocked) throw new Error('正在关闭窗口，不能替换正文');
    if (this.state.composing) throw new Error('输入法组合输入期间不能替换正文');
    this.install(source);
    this.options.dirty();
    this.publish();
  }

  receiveExternal(source: string): void {
    if (source === this.lastExternal) return;
    this.lastExternal = source;
    if (!this.state.ready) { this.update({ source }); return; }
    if (this.state.composing) {
      this.pendingExternal = source === this.getMarkdown() ? null : source;
      return;
    }
    if (source === this.getMarkdown()) return;
    this.install(source);
    // External hydration may serialize to an equivalent but byte-different Markdown string.
    // Treat that installed representation as the clean baseline so Milkdown's delayed
    // markdownUpdated echo is not mistaken for a local edit.
    this.lastPublished = this.getMarkdown();
  }

  private validateModeSwitch(mode: EditorMode): void {
    if (this.state.readLocked) throw new Error('正在关闭窗口，不能切换编辑模式');
    if (!['edit', 'read', 'source'].includes(mode)) throw new Error('未知编辑模式');
    if (this.state.composing) throw new Error('请完成组合输入后再切换模式');
  }

  setMode(mode: EditorMode): void {
    const bridge = this.requireBridge();
    this.validateModeSwitch(mode);
    const source = this.getMarkdown();
    const reasons = bridge.inspect(source);
    if (mode === 'edit' && reasons.length) throw new Error('当前内容需要源码保护：' + reasons.join('、'));
    this.preferredMode = mode;
    if (mode === 'edit' && this.state.active === 'source') {
      this.install(source, true);
    } else {
      const active = mode === 'source' ? 'source' : this.state.active;
      if (this.buffer.value !== source) this.buffer = new SourceBuffer(source);
      bridge.editable(active === 'visual' && mode === 'edit');
      this.update({ mode, active, source, reasons });
    }
    this.focus();
  }

  editSource(display: string): void {
    if (this.state.active !== 'source' || this.state.mode === 'read') throw new Error('当前源码不可编辑');
    this.sourceChanged(this.buffer.edit(display));
  }

  undoSource(redo = false): void {
    if (this.state.composing || this.state.mode === 'read') return;
    this.sourceChanged(this.buffer.undo(redo));
  }

  private sourceChanged(source: string): void {
    if (source === this.state.source) return;
    this.options.dirty();
    this.update({ source, caret: undefined });
    this.publish();
    this.scheduleInspection();
  }

  private cancelInspection(): void {
    clearTimeout(this.inspectionTimer);
    this.inspectionTimer = undefined;
  }

  private scheduleInspection(): void {
    this.cancelInspection();
    if (this.state.composing) return;
    const bridge = this.requireBridge();
    const source = this.state.source;
    this.inspectionTimer = setTimeout(() => {
      if (this.bridge !== bridge || this.state.active !== 'source' || this.state.composing) return;
      if (source === this.state.source) this.update({ reasons: bridge.inspect(source) });
    }, PROTECTION_RECHECK_MS);
  }

  visualChanged(): void {
    if (!this.state.ready || this.installing || this.state.active !== 'visual') return;
    if (this.bridge?.read() === this.lastExternal) return;
    this.options.dirty();
  }

  acceptVisual(identity: unknown, markdown: string): void {
    if (this.bridge?.identity !== identity || this.installing || this.state.active !== 'visual') return;
    if (markdown !== this.getMarkdown()) return;
    this.publish();
  }

  beginComposition(): void {
    if (!this.state.ready || this.state.mode === 'read' || this.state.composing) return;
    if (this.state.active === 'source') this.buffer.beginComposition();
    this.compositionBase = this.getMarkdown();
    this.options.composing(true);
    this.update({ composing: true });
  }

  endComposition(): void {
    if (!this.state.composing) return;
    if (this.state.active === 'source') this.buffer.endComposition();
    const source = this.getMarkdown();
    const incoming = this.pendingExternal;
    this.pendingExternal = null;
    this.options.composing(false);
    this.update({ composing: false });
    if (incoming !== null && source === this.compositionBase) {
      this.install(incoming);
    } else {
      if (incoming !== null && incoming !== source) this.update({ conflict: incoming });
      this.publish();
      if (this.state.active === 'source') this.scheduleInspection();
    }
  }

  resolveConflict(useIncoming: boolean): void {
    if (this.state.composing) throw new Error('请先完成组合输入');
    const incoming = this.state.conflict;
    if (incoming === null) return;
    if (useIncoming) this.setMarkdown(incoming);
    this.update({ conflict: null });
    this.publish();
  }

  requireVisualEdit(): void {
    this.requireBridge();
    if (this.state.active !== 'visual' || this.state.mode !== 'edit' || this.state.composing) {
      throw new Error('当前处于源码保护、只读或组合输入状态，不能执行可视化编辑命令');
    }
  }

  openSourceInput(source: string, caret: number): void {
    this.preferredMode = 'source';
    this.setMarkdown(source);
    this.update({ notice: '已切换到源码，保留正在输入的扩展语法。', caret: displaySource(source.slice(0, caret)).length });
    this.focus();
  }

  reportNotice(notice: string): void {
    this.update({ notice });
  }

  focus(): void {
    if (this.state.active === 'visual') this.requireBridge().focus();
    else this.update({ focusRevision: this.state.focusRevision + 1 });
  }
}
