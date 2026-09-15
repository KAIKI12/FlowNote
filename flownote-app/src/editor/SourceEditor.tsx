import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { EditorSession, SessionSnapshot } from './editorSession';
import { displaySource } from './sourceBuffer';

interface SessionProps { session: EditorSession; state: SessionSnapshot }

export function EditorModeBar({ session, state }: SessionProps) {
  const [error, setError] = useState('');
  const switchMode = (mode: 'edit' | 'source') => {
    try { session.setMode(mode); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  useEffect(() => setError(''), [state.source]);
  return <div className="editor-mode-bar">
    <div role="group" aria-label="编辑模式">
      <button type="button" aria-pressed={state.active === 'visual'} disabled={!state.ready || state.composing || state.readLocked}
        onClick={() => switchMode('edit')}>可视化</button>
      <button type="button" aria-pressed={state.active === 'source'} disabled={!state.ready || state.composing || state.readLocked}
        onClick={() => switchMode('source')}>源码</button>
      {state.mode === 'read' && <span>只读</span>}
    </div>
    {error && <p role="alert">{error}</p>}
    {state.notice && state.active === 'visual' && <p role="status">{state.notice}</p>}
  </div>;
}

function sourceKey(event: KeyboardEvent<HTMLTextAreaElement>, session: EditorSession): void {
  if (event.nativeEvent.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  event.preventDefault();
  session.undoSource(key === 'y' || event.shiftKey);
}

export function SourceEditor({ session, state }: SessionProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!state.focusRevision || !field.current) return;
    field.current.focus();
    if (state.caret !== undefined) field.current.setSelectionRange(state.caret, state.caret);
  }, [state.focusRevision]);
  return <div className="editor-source-surface">
    <p className="editor-source-notice" role="status">
      {state.reasons.length ? `源码保护：${state.reasons.join('、')}。当前可视化编辑尚未安全支持这些内容，请在源码中编辑。`
        : '源码模式：直接编辑 Markdown，完成后可切回可视化。'}
      {state.notice && <span> {state.notice}</span>}
    </p>
    <textarea ref={field} aria-label="Markdown 源码" value={displaySource(state.source)}
      readOnly={state.mode === 'read'} disabled={!state.ready} spellCheck={false}
      autoCapitalize="off" autoCorrect="off" wrap="off"
      onChange={event => session.editSource(event.currentTarget.value)}
      onKeyDown={event => sourceKey(event, session)}
      onCompositionStart={() => session.beginComposition()}
      onCompositionEnd={() => session.endComposition()} />
  </div>;
}

export function SourceConflict({ session, state }: SessionProps) {
  if (state.conflict === null) return null;
  return <div className="editor-source-conflict" role="alert">
    <p>组合输入期间收到外部更新，当前输入已保留。请选择需要继续编辑的版本。</p>
    <details><summary>查看外部内容</summary>
      <textarea aria-label="冲突的外部 Markdown" readOnly value={displaySource(state.conflict)} />
    </details>
    <button type="button" disabled={state.composing || state.readLocked} onClick={() => session.resolveConflict(false)}>保留当前内容</button>
    <button type="button" disabled={state.composing || state.readLocked} onClick={() => session.resolveConflict(true)}>采用外部内容</button>
  </div>;
}
