import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useInstance } from '@milkdown/react';
import { editorViewCtx } from '@milkdown/core';
import { useNoteStore } from '../note/noteStore';
import { EDITOR_STATE_EVENT } from './editorInteractions';
import { insertImage, insertLink, readToolbarState, runEditorAction, setCodeLanguage, setHeading } from './editorActions';
import type { EditorAction } from './editorActions';

type FormatAction = 'bold' | 'italic' | 'strike' | 'inlineCode';
const FORMATS: readonly { action: FormatAction; label: string; text: string }[] = [
  { action: 'bold', label: '加粗', text: 'B' },
  { action: 'italic', label: '斜体', text: 'I' },
  { action: 'strike', label: '删除线', text: 'S̶' },
  { action: 'inlineCode', label: '行内代码', text: '</>' },
];
const BLOCKS: readonly { action: EditorAction; label: string }[] = [
  { action: 'bullet', label: '无序列表' }, { action: 'ordered', label: '有序列表' },
  { action: 'task', label: '任务列表' }, { action: 'quote', label: '引用' },
  { action: 'code', label: '代码块' }, { action: 'table', label: '插入表格' },
];
const LANGUAGES = [
  ['', '纯文本'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['python', 'Python'], ['bash', 'Shell'], ['json', 'JSON'], ['css', 'CSS'],
  ['html', 'HTML'], ['sql', 'SQL'], ['markdown', 'Markdown'],
] as const;

function useToolbar() {
  const [loading, get] = useInstance();
  const composing = useNoteStore(state => state.isComposing);
  const [, refresh] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (loading) return;
    const dom = get()?.ctx.get(editorViewCtx).dom;
    const update = () => refresh(value => value + 1);
    dom?.addEventListener(EDITOR_STATE_EVENT, update);
    return () => dom?.removeEventListener(EDITOR_STATE_EVENT, update);
  }, [loading, get]);
  const state = readToolbarState(get());
  const attempt = (action: () => void): boolean => {
    try { action(); setError(''); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
  };
  const editor = () => { const value = get(); if (!value) throw new Error('编辑器尚未准备就绪'); return value; };
  return { state, error, blocked: loading || composing || !state?.editable,
    command: (action: EditorAction) => attempt(() => runEditorAction(editor(), action)),
    heading: (level: number) => attempt(() => setHeading(editor(), level)),
    language: (value: string) => attempt(() => setCodeLanguage(editor(), value)),
    link: (value: string) => attempt(() => insertLink(editor(), value)),
    image: (value: { src: string; alt: string }) => attempt(() => insertImage(editor(), value)),
  };
}

type ToolbarModel = ReturnType<typeof useToolbar>;

function FormatControls({ model }: { model: ToolbarModel }) {
  const disabled = model.blocked || model.state?.inCode;
  return <>
    <select aria-label="段落样式" value={model.state?.heading ?? 0}
      disabled={disabled || model.state?.inTable} onChange={event => model.heading(Number(event.target.value))}>
      <option value={0}>正文</option>
      {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{'标题 ' + level}</option>)}
    </select>
    {FORMATS.map(({ action, label, text }) => <button type="button" key={action} aria-label={label} title={label}
      aria-pressed={!!model.state?.[action]} disabled={disabled}
      onMouseDown={event => event.preventDefault()} onClick={() => model.command(action)}>{text}</button>)}
  </>;
}

function BlockControls({ model }: { model: ToolbarModel }) {
  return <>{BLOCKS.map(({ action, label }) => <button type="button" key={action} aria-label={label}
    disabled={model.blocked || !!model.state?.inTable || !!model.state?.inCode && action !== 'code'}
    onMouseDown={event => event.preventDefault()} onClick={() => model.command(action)}>{label}</button>)}</>;
}

function TableControls({ model }: { model: ToolbarModel }) {
  if (!model.state?.inTable) return null;
  const controls = [['addRow', '增加一行'], ['addColumn', '增加一列'], ['deleteRow', '删除当前行'], ['deleteColumn', '删除当前列']] as const;
  return <div className="editor-context-controls">
    {controls.map(([action, label]) => <button key={action} type="button" aria-label={label}
      disabled={model.blocked || action === 'deleteRow' && !model.state?.canDeleteRow}
      onMouseDown={event => event.preventDefault()} onClick={() => model.command(action)}>{label}</button>)}
    <span>Tab 换格 · Enter 离开表格 · 表头不可单独删除</span>
  </div>;
}

function CodeControls({ model }: { model: ToolbarModel }) {
  if (!model.state?.inCode) return null;
  const language = model.state.language;
  return <label className="editor-context-controls">代码语言
    <select aria-label="代码语言" value={language} disabled={model.blocked} onChange={event => model.language(event.target.value)}>
      {LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      {!LANGUAGES.some(([value]) => value === language) && <option value={language}>{language + '（保留当前语言）'}</option>}
    </select><span>Tab 缩进 · Shift+Tab 退回</span>
  </label>;
}

function LinkControls({ model }: { model: ToolbarModel }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (model.link(url)) { setOpen(false); setUrl(''); }
  };
  return <>
    <button type="button" aria-label="插入链接" disabled={model.blocked || model.state?.inCode}
      onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)}>链接</button>
    {open && <form className="editor-link-form" aria-label="链接设置" onSubmit={submit}>
      <input aria-label="链接地址" placeholder="https:// 或相对地址" value={url} disabled={model.blocked}
        onChange={event => setUrl(event.target.value)} autoFocus />
      <button type="submit" disabled={model.blocked}>应用链接</button>
      <button type="button" onClick={() => setOpen(false)}>取消</button>
    </form>}
  </>;
}

function ImageControls({ model }: { model: ToolbarModel }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const disabled = model.blocked || model.state?.inCode || model.state?.inlineCode;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (model.image({ src, alt })) { setOpen(false); setSrc(''); setAlt(''); }
  };
  return <>
    <button type="button" aria-label="插入图片" disabled={disabled}
      onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)}>图片</button>
    {open && <form className="editor-link-form" aria-label="图片设置" onSubmit={submit}>
      <input aria-label="图片地址" placeholder="https://… 或 assets/image.png" value={src} disabled={disabled}
        onChange={event => setSrc(event.target.value)} autoFocus />
      <input aria-label="图片替代文字" placeholder="图片说明（可选）" value={alt} disabled={disabled}
        onChange={event => setAlt(event.target.value)} />
      <button type="submit" disabled={disabled}>插入图片</button>
      <button type="button" onClick={() => setOpen(false)}>取消</button>
    </form>}
  </>;
}

export function EditorToolbar() {
  const model = useToolbar();
  return <div className="editor-toolbar" role="toolbar" aria-label="Markdown 格式">
    <div className="editor-toolbar-main">
      <button type="button" aria-label="撤销" title="撤销 Ctrl+Z" disabled={model.blocked || !model.state?.canUndo}
        onMouseDown={event => event.preventDefault()} onClick={() => model.command('undo')}>↶</button>
      <button type="button" aria-label="重做" title="重做 Ctrl+Y" disabled={model.blocked || !model.state?.canRedo}
        onMouseDown={event => event.preventDefault()} onClick={() => model.command('redo')}>↷</button>
      <FormatControls model={model} /><LinkControls model={model} /><ImageControls model={model} /><BlockControls model={model} />
    </div>
    <TableControls model={model} /><CodeControls model={model} />
    {model.error && <p role="alert" className="editor-toolbar-error">{model.error}</p>}
  </div>;
}
