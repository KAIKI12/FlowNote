import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { DocumentSession, DocumentState } from './documentSession';
import type { MarkdownFileError } from './fileTypes';

interface FileControlsProps {
  session: DocumentSession;
  state: DocumentState;
  hasDocument: boolean;
  dirty: boolean;
  composing: boolean;
  ready: boolean;
}

function run(session: DocumentSession, operation: () => Promise<unknown>): void {
  void operation().catch(cause => session.notifyError(cause));
}

function operationBlocked(state: DocumentState, composing: boolean): boolean {
  return !!state.busy || !!state.pending || composing;
}

export function FileToolbar({ session, state, hasDocument, composing, ready }: FileControlsProps) {
  const blocked = operationBlocked(state, composing);
  const writable = session.port.canWrite && hasDocument && ready;
  return <div className="file-toolbar" role="group" aria-label="笔记文件">
    <button aria-label="新建笔记" disabled={blocked} onClick={() => run(session, () => session.newDocument())}>新建</button>
    <button aria-label="打开 Markdown 文件" disabled={blocked} onClick={() => run(session, () => session.open())}>打开</button>
    <button aria-label="保存 Markdown 文件" disabled={blocked || !writable || state.file?.readOnly}
      onClick={() => run(session, () => session.save())}>保存</button>
    <button aria-label="另存为 Markdown 文件" disabled={blocked || !writable}
      onClick={() => run(session, () => session.save(true))}>另存为</button>
    <button aria-label="重新载入 Markdown 文件" disabled={blocked || !state.file || !session.port.canWrite}
      onClick={() => run(session, () => session.reload())}>重载</button>
    <button aria-label="关闭笔记" disabled={blocked || !hasDocument}
      onClick={() => run(session, () => session.closeDocument())}>关闭</button>
  </div>;
}

export function FileStatus({ session, state, hasDocument, dirty }: FileControlsProps) {
  const operations = { open: '正在打开…', reload: '正在重载…', save: '正在保存…', switch: '正在切换…', closing: '正在关闭…' };
  const status = state.busy ? operations[state.busy] : !hasDocument ? '未打开笔记'
    : dirty ? '有未保存修改' : state.file && session.port.canWrite ? '已保存' : '尚未保存到当前文件';
  return <p aria-label="文件保存状态" role="status" title={state.file?.path}>
    {state.file?.name ?? '未命名笔记'} · {status}
    {session.port.mode === 'import' && ' · 网页副本，请使用导出'}
    {state.file?.readOnly && session.port.canWrite && ' · 原文件只读'}
  </p>;
}

export function FileErrorView({ error }: { error: MarkdownFileError | null }) {
  if (!error) return null;
  return <div role="alert" className="writing-error file-error">
    <p>{error.message}</p>
    {error.recoveryPath && <p>当前内容恢复位置：<code>{error.recoveryPath}</code></p>}
    {error.originalRecoveryPath && <p>原文恢复位置：<code>{error.originalRecoveryPath}</code></p>}
  </div>;
}

function trapFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'Tab') return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0];
  const boundary = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
  if (target && document.activeElement === boundary) { event.preventDefault(); target.focus(); }
}

export function UnsavedDialog({ session, state, composing, exportNote, canSave }: {
  session: DocumentSession; state: DocumentState; composing: boolean; exportNote: () => void; canSave?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const visible = !!state.pending && (!composing || state.pending.kind === 'window');
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [visible]);
  if (!visible) return null;
  return <div className="file-dialog-backdrop">
    <div ref={root} role="dialog" aria-modal="true" aria-label="未保存的更改" className="file-dialog"
      onKeyDown={event => { trapFocus(event); if (event.key === 'Escape' && !state.busy) run(session, () => session.resolvePending('cancel')); }}>
      <h2>当前笔记有未保存的更改</h2>
      <p>{state.pending?.file ? `继续打开 ${state.pending.file.name} 前，请处理当前更改。` : '继续操作前，请保存或明确放弃当前更改。'}</p>
      {state.notice && <p role="status">{state.notice}</p>}
      <FileErrorView error={state.error} />
      <div className="file-dialog-actions">
        <button disabled={!!state.busy} onClick={() => run(session, () => session.resolvePending('cancel'))}>取消</button>
        {(canSave ?? session.port.canWrite) ? <button disabled={!!state.busy} onClick={() => run(session, () => session.resolvePending('save'))}>保存并继续</button>
          : <button disabled={!!state.busy} onClick={exportNote}>导出副本</button>}
        <button disabled={!!state.busy} onClick={() => run(session, () => session.resolvePending('discard'))}>放弃更改并继续</button>
      </div>
    </div>
  </div>;
}
