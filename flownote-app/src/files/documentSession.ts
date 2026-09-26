import { contentForFile, markdownBytes } from './fileEncoding';
import { fileError, MarkdownFileError } from './fileTypes';
import type { MarkdownFile, MarkdownFilePort } from './fileTypes';

export interface DocumentRead {
  hasDocument: boolean;
  content: string;
  dirty: boolean;
  composing: boolean;
  kind: string;
  ready?: boolean;
}
interface DocumentEnvironment {
  read(): DocumentRead;
  apply(file: MarkdownFile | null): void;
  close(): void;
  saved(update: { file: MarkdownFile; content: string; clean: boolean }): void;
  saveAlternate?(asNew: boolean): Promise<boolean>;
  closeAlternate?(): Promise<void>;
  closeWindow(): Promise<void>;
}
interface PendingDocument {
  kind: 'open' | 'reload' | 'new' | 'close' | 'window';
  file?: MarkdownFile;
  after?: () => void;
}
export interface DocumentState {
  file: MarkdownFile | null;
  documentKey: number;
  busy: 'open' | 'reload' | 'save' | 'switch' | 'closing' | null;
  pending: PendingDocument | null;
  error: MarkdownFileError | null;
  notice: string;
}
interface SaveCapture { key: number; editorContent: string; content: string }

export class DocumentSession {
  private state: DocumentState = { file: null, documentKey: 0, busy: null, pending: null, error: null, notice: '' };
  private listeners = new Set<() => void>();
  private active = true;
  private generation = 0;
  private queuedSave = false;
  private saving?: Promise<boolean>;

  constructor(readonly port: MarkdownFilePort, private readonly environment: DocumentEnvironment) {}
  getSnapshot = (): DocumentState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  activate(): void { this.active = true; }
  notifyError(cause: unknown): void { this.report(cause); }

  private update(patch: Partial<DocumentState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  private report(cause: unknown): false {
    this.update({ error: fileError(cause), notice: '' });
    return false;
  }

  private currentGeneration(generation: number): boolean {
    return this.active && generation === this.generation;
  }

  private available(): boolean {
    if (this.environment.read().composing) return this.report(new MarkdownFileError('composing', '请先完成组合输入'));
    if (this.state.busy || this.state.pending) return this.report(new MarkdownFileError('busy', '请先完成当前文件操作'));
    return true;
  }

  private async release(file?: MarkdownFile | null): Promise<void> {
    if (!file) return;
    try { await this.port.release(file.id); }
    catch (cause) {
      if (this.active) this.report(new MarkdownFileError('io', `关闭文件句柄失败：${fileError(cause).message}`));
      else console.error('关闭文件句柄失败', cause);
    }
  }

  dispose(): void {
    this.active = false;
    this.generation += 1;
    void this.release(this.state.file);
    if (this.state.pending?.file?.id !== this.state.file?.id) void this.release(this.state.pending?.file);
  }

  async open(): Promise<void> { await this.load('open'); }
  async openWorkspace(relativePath: string, after?: () => void): Promise<void> {
    if (!this.available()) return;
    if (!this.port.openWorkspace) { this.report(new MarkdownFileError('unsupported', '当前文件入口不支持 Workspace 打开')); return; }
    const generation = this.generation;
    this.update({ busy: 'open', error: null, notice: '' });
    let file: MarkdownFile | null = null;
    try {
      file = await this.port.openWorkspace(relativePath);
      if (!this.currentGeneration(generation)) { await this.release(file); return; }
      this.update({ busy: null });
      await this.offer({ kind: 'open', file, after });
    } catch (cause) {
      if (file && file.id !== this.state.file?.id) await this.release(file);
      if (this.currentGeneration(generation)) this.report(cause);
    } finally {
      if (this.currentGeneration(generation)) this.update({ busy: null });
    }
  }
  async reload(): Promise<void> { await this.load('reload'); }

  private async load(kind: 'open' | 'reload'): Promise<void> {
    if (!this.available()) return;
    if (kind === 'reload' && !this.state.file) { this.report(new MarkdownFileError('closed', '尚未打开文件')); return; }
    const generation = this.generation;
    this.update({ busy: kind, error: null, notice: '' });
    try {
      const file = kind === 'open' ? await this.port.open() : await this.port.reload(this.state.file!.id);
      if (!this.currentGeneration(generation)) { await this.release(file); return; }
      this.update({ busy: null });
      if (file) await this.offer({ kind, file });
    } catch (cause) { if (this.currentGeneration(generation)) this.report(cause); }
    finally { if (this.currentGeneration(generation)) this.update({ busy: null }); }
  }

  async newDocument(after?: () => void): Promise<void> {
    if (this.available()) await this.offer({ kind: 'new', after });
  }

  async detachCurrent(): Promise<void> {
    if (!this.available()) throw this.state.error ?? new MarkdownFileError('busy', '请先完成当前文件操作');
    const file = this.state.file;
    if (!file) return;
    this.update({ file: null, error: null, notice: '' });
    await this.release(file);
  }

  async closeDocument(): Promise<void> {
    if (this.available()) await this.offer({ kind: 'close' });
  }

  async requestWindowClose(): Promise<void> {
    if (this.state.busy || this.state.pending) {
      this.report(new MarkdownFileError('busy', '请先完成当前文件操作'));
      return;
    }
    await this.offer({ kind: 'window' });
  }

  private async offer(action: PendingDocument): Promise<void> {
    const current = this.environment.read();
    if (current.dirty || current.composing) { this.update({ pending: action }); return; }
    await this.apply(action);
  }

  async resumePending(): Promise<void> {
    const current = this.environment.read();
    if (this.state.pending && !this.state.busy && !current.composing && !current.dirty) {
      await this.apply(this.state.pending);
    }
  }

  private async apply(action: PendingDocument): Promise<void> {
    if (action.kind === 'window') { await this.finishWindowClose(); return; }
    this.update({ busy: 'switch' });
    const previous = this.state.file;
    let applied = false;
    try {
      const file = action.file ?? null;
      const alternate = this.environment.read().kind !== 'markdown' && this.environment.closeAlternate;
      if (alternate) await alternate();
      if (action.kind === 'close') { if (!alternate) this.environment.close(); }
      else this.environment.apply(file);
      this.update({ file, pending: null, error: null, documentKey: this.state.documentKey + 1,
        notice: file && this.port.mode === 'import' ? '已导入文件副本，请导出以保存修改。' : '' });
      if (previous?.id !== file?.id) await this.release(previous);
      applied = true;
    } catch (cause) { this.report(cause); }
    finally { this.update({ busy: null }); }
    if (applied) action.after?.();
  }

  private async finishWindowClose(): Promise<void> {
    this.update({ busy: 'closing' });
    try { await this.environment.closeWindow(); }
    catch (cause) { this.report(cause); this.update({ busy: null }); }
  }

  async resolvePending(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
    const action = this.state.pending;
    if (!action || this.state.busy) return;
    if (choice === 'cancel') return this.cancelPending(action);
    if (this.environment.read().composing && !(action.kind === 'window' && choice === 'discard')) {
      this.report(new MarkdownFileError('composing', '请先完成组合输入'));
      return;
    }
    const generation = this.generation;
    const saved = choice === 'save';
    if (saved && !(await this.save())) return;
    if (!this.pendingIsCurrent(action, generation)) return;
    if (saved && this.environment.read().dirty) { this.update({ notice: '保存期间有新输入，请先保存这些修改。' }); return; }
    await this.continuePending({ action, generation, saved });
  }

  private async cancelPending(action: PendingDocument): Promise<void> {
    this.update({ pending: null });
    if (action.file?.id !== this.state.file?.id) await this.release(action.file);
  }

  private pendingIsCurrent(action: PendingDocument, generation: number): boolean {
    return this.currentGeneration(generation) && this.state.pending === action;
  }

  private async refreshCandidate(action: PendingDocument, saved: boolean): Promise<PendingDocument> {
    if (!saved || !action.file || action.file.path !== this.state.file?.path) return action;
    this.update({ busy: 'reload' });
    return { ...action, file: await this.port.reload(action.file.id) };
  }

  private async continuePending({ action, generation, saved }: {
    action: PendingDocument; generation: number; saved: boolean;
  }): Promise<void> {
    this.update({ busy: 'switch' });
    try {
      const next = await this.refreshCandidate(action, saved);
      if (!this.pendingIsCurrent(action, generation)) return;
      const current = this.environment.read();
      const discardWindowDuringComposition = next.kind === 'window' && !saved;
      if ((current.composing && !discardWindowDuringComposition) || (saved && current.dirty)) {
        this.update({ pending: next });
        return;
      }
      await this.apply(next);
    } catch (cause) { if (this.currentGeneration(generation)) this.report(cause); }
    finally { if (this.currentGeneration(generation) && this.state.busy !== 'closing') this.update({ busy: null }); }
  }

  private capture(): SaveCapture {
    const current = this.environment.read();
    if (current.composing) throw new MarkdownFileError('composing', '请先完成组合输入，再保存笔记');
    if (!current.hasDocument) throw new MarkdownFileError('closed', '没有打开的笔记');
    if (current.ready === false) throw new MarkdownFileError('notReady', '编辑器正在准备，请稍候');
    if (current.kind !== 'markdown') throw new MarkdownFileError('unsupported', 'Mixed Note 文件保存尚未实现');
    if (!this.port.canWrite) throw new MarkdownFileError('unsupported', '网页模式请使用「导出 Markdown」；原位保存请使用 Windows 桌面版');
    const file = this.state.file;
    const content = file && !current.dirty ? file.content : contentForFile(current.content, file?.content);
    markdownBytes(content);
    return { key: this.state.documentKey, editorContent: current.content, content };
  }

  save(asNew = false): Promise<boolean> {
    if (this.state.busy === 'save' && !asNew) { this.queuedSave = true; return this.saving ?? Promise.resolve(false); }
    if (this.state.busy) return Promise.resolve(this.report(new MarkdownFileError('busy', '请等待当前文件操作完成')));
    if (this.environment.read().kind !== 'markdown') {
      if (!this.environment.saveAlternate) return Promise.resolve(this.report(new MarkdownFileError('unsupported', 'Mixed Note 保存尚未接入')));
      this.update({ busy: 'save', error: null, notice: '' });
      const task = this.environment.saveAlternate(asNew).catch(cause => this.report(cause)).finally(() => {
        this.saving = undefined;
        this.update({ busy: null });
      });
      this.saving = task;
      return task;
    }
    try {
      const capture = this.capture();
      this.update({ busy: 'save', error: null, notice: '' });
      const task = this.drain(capture, asNew);
      this.saving = task;
      return task;
    } catch (cause) { return Promise.resolve(this.report(cause)); }
  }

  private async drain(first: SaveCapture, asNew: boolean): Promise<boolean> {
    let capture = first;
    let saved = false;
    try {
      do {
        this.queuedSave = false;
        saved = await this.saveCapture(capture, asNew);
        if (!saved || !this.queuedSave || !this.environment.read().dirty) break;
        capture = this.capture();
        asNew = false;
      } while (this.active);
      return saved;
    } catch (cause) { return this.report(cause); }
    finally { this.queuedSave = false; this.saving = undefined; this.update({ busy: null }); }
  }

  private async saveCapture(capture: SaveCapture, asNew: boolean): Promise<boolean> {
    const original = this.state.file;
    const generation = this.generation;
    const file = await this.writeCapture({ original, asNew, capture });
    if (!file) return false;
    if (!this.currentGeneration(generation)) { if (file.id !== original?.id) await this.release(file); return false; }
    this.acceptSaved(file, capture);
    if (original?.id !== file.id && original?.id !== this.state.pending?.file?.id) await this.release(original);
    return true;
  }

  private writeCapture({ original, asNew, capture }: {
    original: MarkdownFile | null; asNew: boolean; capture: SaveCapture;
  }): Promise<MarkdownFile | null> {
    if (original?.readOnly && !asNew) throw new MarkdownFileError('readOnly', '文件为只读，请使用另存为');
    return !original || asNew
      ? this.port.saveAs({ name: original?.name ?? 'untitled.md', content: capture.content })
      : this.port.save({ id: original.id, revision: original.revision, content: capture.content });
  }

  private acceptSaved(file: MarkdownFile, capture: SaveCapture): void {
    if (file.content !== capture.content) throw new MarkdownFileError('protocol', '文件服务返回的内容与保存快照不一致');
    const current = this.environment.read();
    const clean = current.content === capture.editorContent && !current.composing && this.state.documentKey === capture.key;
    this.update({ file, error: null, notice: file.notice ?? (clean ? '已保存。' : '本次保存已完成，后续输入尚未保存。') });
    this.environment.saved({ file, content: current.content, clean });
  }
}
