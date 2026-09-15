import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { Editor, EditorStatus, editorViewCtx } from '@milkdown/core';
import { useInstance } from '@milkdown/react';
import { useNoteStore } from '../note/noteStore';
import type { FlowNoteEditorApi } from './editorTypes';
import type { EditorMode } from './editorTypes';
import { editorSessionCtx } from './editorRuntime';
import { displaySource } from './sourceBuffer';
import { downloadText } from '../utils/downloadText';

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const EVIDENCE_VERSION = 2;
const JSON_INDENT = 2;

interface SourceInput { name: string; markdown: string }
interface Snapshot {
  evidenceVersion: number;
  decision: 'pending';
  capturedAt: string;
  sourceName: string;
  inputMarkdown: string;
  markdown: string;
  activeEditor: 'visual' | 'source';
  mode: EditorMode;
  protectionReasons: string[];
  document: unknown;
  dom: string;
  roundTrips: number;
  userAgent: string;
  diskSaveVerified: false;
}
interface QualificationProps { editorRef: RefObject<FlowNoteEditorApi> }

function useGateState() {
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);
  const [draft, setDraft] = useState<SourceInput>({ name: 'manual.md', markdown: '' });
  const [baseline, setBaseline] = useState<SourceInput | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('选择测试文件或粘贴 Markdown，然后装载原文。');
  return { operation, draft, setDraft, baseline, setBaseline, snapshot, setSnapshot,
    busy, setBusy, error, setError, notice, setNotice };
}

interface GateContext extends QualificationProps {
  state: ReturnType<typeof useGateState>;
  get: () => Editor | undefined;
  blocked: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireApi(context: GateContext): FlowNoteEditorApi {
  if (context.blocked || useNoteStore.getState().isComposing) throw new Error('请等待编辑器就绪、文件读取或组合输入结束');
  const api = context.editorRef.current;
  if (!api) throw new Error('编辑器接口尚未就绪');
  return api;
}

function requireBaseline(context: GateContext): SourceInput {
  if (!context.state.baseline) throw new Error('请先装载测试原文');
  return context.state.baseline;
}

function sourceDom(root: Element, markdown: string): string {
  const field = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]');
  if (!field || field.value !== displaySource(markdown)) throw new Error('源码视图尚未同步，请重新采集');
  const current = field.cloneNode(true) as HTMLTextAreaElement;
  current.textContent = field.value;
  return current.outerHTML;
}

function activeStructure(editor: Editor, markdown: string) {
  const session = editor.ctx.get(editorSessionCtx.key);
  if (!session) throw new Error('编辑器内容保护状态尚未就绪');
  const state = session.getSnapshot();
  const view = editor.ctx.get(editorViewCtx);
  const root = view.dom.closest('.flownote-editor');
  if (!root || root.getAttribute('data-active-editor') !== state.active) throw new Error('编辑视图正在切换，请稍后采集');
  return { activeEditor: state.active, mode: state.mode, protectionReasons: state.reasons,
    document: state.active === 'source' ? null : view.state.doc.toJSON() as unknown,
    dom: state.active === 'source' ? sourceDom(root, markdown) : view.dom.outerHTML };
}

function takeSnapshot({ context, source, roundTrips }: {
  context: GateContext; source: SourceInput; roundTrips: number;
}): Snapshot {
  const api = requireApi(context);
  const editor = context.get();
  if (!editor || editor.status !== EditorStatus.Created) throw new Error('编辑器尚未准备就绪');
  const markdown = api.getMarkdown();
  const structure = activeStructure(editor, markdown);
  return { evidenceVersion: EVIDENCE_VERSION, decision: 'pending',
    capturedAt: new Date().toISOString(), sourceName: source.name,
    inputMarkdown: source.markdown, markdown, ...structure, roundTrips,
    userAgent: navigator.userAgent, diskSaveVerified: false };
}

async function perform(context: GateContext, action: (request: number) => unknown): Promise<void> {
  const request = ++context.state.operation.current;
  context.state.setBusy(true);
  context.state.setError('');
  try { await action(request); }
  catch (error) {
    if (request !== context.state.operation.current) return;
    context.state.setError(errorMessage(error));
    context.state.setNotice('操作失败；请保留原文与错误信息。');
  } finally {
    if (request === context.state.operation.current) context.state.setBusy(false);
  }
}

function afterRender(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function loadDraft(context: GateContext, request: number): Promise<void> {
  const source = { ...context.state.draft };
  if (new TextEncoder().encode(source.markdown).byteLength > MAX_MARKDOWN_BYTES) {
    throw new Error('测试 Markdown 不能超过 2 MiB');
  }
  requireApi(context).setMarkdown(source.markdown);
  context.state.setBaseline(source);
  context.state.setSnapshot(null);
  await afterRender();
  if (request !== context.state.operation.current) return;
  context.state.setSnapshot(takeSnapshot({ context, source, roundTrips: 0 }));
  context.state.setNotice('原文已装载并采集；请比较视觉、结构与输出。');
}

function captureCurrent(context: GateContext): Snapshot {
  const source = requireBaseline(context);
  const roundTrips = context.state.snapshot?.roundTrips ?? 0;
  const snapshot = takeSnapshot({ context, source, roundTrips });
  context.state.setSnapshot(snapshot);
  context.state.setNotice('已采集当前状态；语义是否一致仍需检查。');
  return snapshot;
}

async function reloadCurrent(context: GateContext, request: number): Promise<void> {
  const previous = captureCurrent(context);
  requireApi(context).setMarkdown(previous.markdown);
  await afterRender();
  if (request !== context.state.operation.current) return;
  context.state.setSnapshot(takeSnapshot({ context,
    source: requireBaseline(context), roundTrips: previous.roundTrips + 1 }));
  context.state.setNotice('当前输出已重新装载，输入基线保持不变。');
}

function downloadEvidence({ snapshot, format }: { snapshot: Snapshot; format: 'markdown' | 'json' }): void {
  const isMarkdown = format === 'markdown';
  const content = isMarkdown ? snapshot.markdown : JSON.stringify(snapshot, null, JSON_INDENT);
  const type = isMarkdown ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8';
  const name = snapshot.sourceName.replace(/\.(md|markdown)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  downloadText({ content, type, fileName: `${name || 'qualification'}.${isMarkdown ? 'roundtrip.md' : 'evidence.json'}` });
}

function exportCurrent(context: GateContext, format: 'markdown' | 'json'): void {
  downloadEvidence({ snapshot: captureCurrent(context), format });
  context.state.setNotice('已请求下载当前结果；这不是产品磁盘保存验收。');
}

function readMarkdown(file: File): Promise<string> {
  if (!/\.(md|markdown)$/i.test(file.name)) return Promise.reject(new Error('请选择 .md 或 .markdown 测试文件'));
  if (file.size > MAX_MARKDOWN_BYTES) return Promise.reject(new Error('测试 Markdown 不能超过 2 MiB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (reader.result === null || typeof reader.result === 'string') throw new Error('文件没有返回字节内容');
        resolve(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(reader.result));
      } catch (error) { reject(new Error(`无法按 UTF-8 读取 Markdown：${errorMessage(error)}`)); }
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取测试文件失败'));
    reader.onabort = () => reject(new Error('测试文件读取已取消'));
    reader.readAsArrayBuffer(file);
  });
}

function useFileImport(state: ReturnType<typeof useGateState>) {
  const request = useRef(0);
  // A late read must not overwrite a newer selection or an unmounted panel.
  useEffect(() => () => { request.current += 1; }, []);
  return async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const current = ++request.current;
    state.setBusy(true);
    state.setError('');
    try {
      const markdown = await readMarkdown(file);
      if (current !== request.current) return;
      state.setDraft({ name: file.name, markdown });
      state.setNotice('测试文件已读入待装载区；点击装载原文后才替换正文。');
    } catch (error) {
      if (current === request.current) state.setError(errorMessage(error));
    } finally {
      if (current === request.current) state.setBusy(false);
    }
  };
}

function useQualification(editorRef: RefObject<FlowNoteEditorApi>) {
  const [loading, get] = useInstance();
  const isComposing = useNoteStore((state) => state.isComposing);
  const state = useGateState();
  const readFile = useFileImport(state);
  const blocked = loading || isComposing || state.busy;
  const context: GateContext = { editorRef, state, get, blocked };
  return { ...state, blocked, readFile,
    load: () => perform(context, request => loadDraft(context, request)),
    capture: () => perform(context, () => captureCurrent(context)),
    reload: () => perform(context, request => reloadCurrent(context, request)),
    exportMarkdown: () => perform(context, () => exportCurrent(context, 'markdown')),
    exportJson: () => perform(context, () => exportCurrent(context, 'json')),
    readiness: loading ? '编辑器初始化中' : isComposing ? '组合输入中' : state.busy ? '处理中' : '就绪',
  };
}

type QualificationModel = ReturnType<typeof useQualification>;

function InputControls({ model }: { model: QualificationModel }) {
  return <section className="gate-section" aria-label="测试输入">
    <label>选择 Markdown 测试文件（最大 2 MiB）
      <input type="file" accept=".md,.markdown" disabled={model.blocked} onChange={model.readFile} />
    </label>
    <label>待装载 Markdown · {model.draft.name}
      <textarea data-testid="gate-draft" aria-label="待装载 Markdown" rows={8}
        value={model.draft.markdown} disabled={model.blocked} spellCheck={false}
        onChange={(event) => model.setDraft({ ...model.draft, markdown: event.target.value })} />
    </label>
    <p className="gate-hint">装载会替换当前编辑内容，请使用测试副本。</p>
    <button type="button" disabled={model.blocked} onClick={model.load}>装载原文</button>
  </section>;
}

function ActionControls({ model }: { model: QualificationModel }) {
  const disabled = model.blocked || !model.baseline;
  return <div className="gate-actions" aria-label="采集与导出">
    <button type="button" disabled={disabled} onClick={model.capture}>采集当前状态</button>
    <button type="button" disabled={disabled} onClick={model.reload}>重载当前输出</button>
    <button type="button" disabled={disabled} onClick={model.exportMarkdown}>导出 Markdown</button>
    <button type="button" disabled={disabled} onClick={model.exportJson}>导出证据 JSON</button>
  </div>;
}

function EvidenceField({ title, value, testId }: { title: string; value: string; testId: string }) {
  return <label className="gate-evidence-field">{title}
    <textarea aria-label={title} data-testid={testId} readOnly value={value} rows={7} spellCheck={false} />
  </label>;
}

function SnapshotView({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <p className="gate-hint">装载原文后生成快照。采集结果不会自动判定 PASS。</p>;
  const equal = snapshot.inputMarkdown === snapshot.markdown;
  return <section className="gate-section" aria-label="采集结果">
    <p>重载次数：{snapshot.roundTrips} · 采集于 {snapshot.capturedAt}</p>
    <p>当前视图：{snapshot.activeEditor === 'source' ? '源码（富文本结构未参与编辑）' : '可视化'}
      {snapshot.protectionReasons.length > 0 && ` · ${snapshot.protectionReasons.join('、')}`}</p>
    <p>{equal ? '原文与输出字面一致，仍需完成编辑与 IME 验收。' : '原文与输出存在字面差异，请区分格式规范化与语义变化。'}</p>
    <EvidenceField title="输入原文（当前基线）" value={snapshot.inputMarkdown} testId="gate-original" />
    <EvidenceField title={snapshot.activeEditor === 'source' ? '当前源码 Markdown' : '序列化 Markdown'} value={snapshot.markdown} testId="gate-markdown" />
    <EvidenceField title="ProseMirror 文档结构" value={JSON.stringify(snapshot.document, null, JSON_INDENT)} testId="gate-tree" />
    <EvidenceField title="编辑器 DOM" value={snapshot.dom} testId="gate-dom" />
  </section>;
}

const PANEL_STYLES = `
.qualification-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(340px,44%); gap:16px; height:100%; min-height:0; }
.qualification-workspace > .flownote-editor { border:1px solid var(--border); border-radius:8px; min-width:0; }
.qualification-panel { min-width:0; overflow:auto; padding:16px; border:1px solid var(--border); border-radius:8px; background:var(--bg-secondary); font-size:13px; }
.qualification-panel h2 { font-size:19px; margin-bottom:8px; }
.qualification-panel label { display:block; font-weight:600; }
.qualification-panel textarea { display:block; width:100%; margin:6px 0 12px; padding:10px; resize:vertical; border:1px solid var(--border); border-radius:5px; background:var(--bg-primary); color:var(--text-primary); font:12px/1.6 Consolas,monospace; }
.qualification-panel input { display:block; max-width:100%; margin:8px 0 12px; }
.qualification-panel button { min-height:36px; padding:6px 10px; border:1px solid var(--border); border-radius:5px; background:var(--bg-primary); color:var(--text-primary); cursor:pointer; }
.qualification-panel button:disabled { opacity:.5; cursor:not-allowed; }
.qualification-panel :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.gate-section { display:grid; gap:10px; padding:14px 0; border-top:1px solid var(--border); margin-top:14px; }
.gate-actions { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
.gate-hint { color:var(--text-secondary); font-weight:400; }
.gate-error { color:#b42318; padding:10px; border:1px solid currentColor; border-radius:5px; white-space:pre-wrap; }
@media (max-width:1000px) { .qualification-workspace { grid-template-columns:minmax(0,1fr); height:auto; } .qualification-workspace > .flownote-editor { height:55vh; } .qualification-panel { overflow:visible; } }
`;

export default function MarkdownQualification({ editorRef }: QualificationProps) {
  const model = useQualification(editorRef);
  return <aside className="qualification-panel" aria-label="Markdown 资格测试面板">
    <style>{PANEL_STYLES}</style>
    <h2>Markdown Editor Qualification</h2>
    <p role="status" data-testid="gate-status">{model.readiness} · Gate: pending</p>
    <p className="gate-hint">左侧为实际编辑器。请同时比较原文、视觉、结构与输出。</p>
    <InputControls model={model} />
    {model.error && <p role="alert" className="gate-error">{model.error}</p>}
    <p aria-live="polite">{model.notice}</p>
    <ActionControls model={model} />
    <SnapshotView snapshot={model.snapshot} />
    <p className="gate-hint">证据导出与重载不代表产品磁盘保存已通过。图片相对路径、视觉和真实中文输入法仍需单独验收。</p>
  </aside>;
}
