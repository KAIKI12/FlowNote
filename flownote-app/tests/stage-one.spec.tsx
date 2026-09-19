import { act } from 'react';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { undo, redo } from '@milkdown/prose/history';
import { createHarness, settle } from './editorHarness';
import { interactionChecks } from './editorInteractions.spec';
import { toolbarChecks } from './editorToolbar.spec';
import { appChecks } from './appEditing.spec';
import { regressionChecks } from './editorRegressions.spec';
import type { TestContext } from './editorRegressions.spec';
import { workspaceAppChecks, workspaceChecks } from './workspace.spec';

const SAMPLE = '# 标题\n\n正文 **粗体**、*斜体*、~~删除~~ 和 [链接](https://example.com)。\n\n> 引用内容\n\n3. 第一项\n   1. 子项\n4. 第二项\n\n| 名称 | 数值 |\n| --- | ---: |\n| 时钟 | 100 |\n\n```javascript\nconst answer = 42;\nconsole.log("你好");\n```\n';
type Check = { name: string; run: () => Promise<void> };

function foundationChecks(h: ReturnType<typeof createHarness>): Check[] {
  return [
    { name: '基础显示：标题、强调、引用、表格、代码均有正确结构', run: async () => {
      await h.mount(SAMPLE);
      for (const selector of ['h1', 'strong', 'em', 'del', 'a', 'blockquote', 'table', 'pre code']) {
        assert.ok(document.querySelector('.ProseMirror ' + selector), `Missing ${selector}`);
      }
      assert.equal(document.querySelector('ol')!.getAttribute('start'), '3');
    } },
    { name: '基础显示：正文使用文档布局并保留列表缩进', run: async () => {
      await h.mount(SAMPLE);
      assert.equal(getComputedStyle(h.view().dom).display, 'block');
      assert.equal(getComputedStyle(h.view().dom).whiteSpace, 'pre-wrap');
      assert.ok(parseFloat(getComputedStyle(document.querySelector('ol')!).paddingInlineStart) > 0);
      assert.ok(parseFloat(getComputedStyle(document.querySelector('blockquote')!).borderLeftWidth) > 0);
    } },
    { name: '无感编辑：Markdown 正文和源码输入都不显示整块 focus 边框', run: async () => {
      await h.mount(SAMPLE);
      const globalCss = readFileSync(path.join(process.cwd(), 'src/styles/global.css'), 'utf8');
      const editorCss = readFileSync(path.join(process.cwd(), 'src/styles/editor.css'), 'utf8');
      assert.equal(/\.writing-app\s+:focus-visible\s*\{/.test(globalCss), false,
        'Do not apply one global focus ring to every descendant of the writing workspace');
      assert.match(editorCss,
        /\.writing-app\s+\.editor-source-surface\s*>\s*textarea:focus,[\s\S]*?\.writing-app\s+\.editor-source-surface\s*>\s*textarea:focus-visible\s*\{[^}]*outline:\s*none[^}]*box-shadow:\s*none/s,
        'Source editor must override the workspace-wide textarea focus ring');
      assert.match(editorCss, /\.editor-source-notice\s*\{[^}]*border:\s*0/s,
        'Source protection notice must not draw a full-width divider above the editor');
      assert.match(editorCss,
        /\.flownote-editor\s+\.ProseMirror-gapcursor:after\s*\{[^}]*width:\s*0[^}]*border-top:\s*0\s*!important[^}]*border-left:\s*1px/s,
        'Gap cursor must look like a caret rather than ProseMirror\'s default horizontal rule');
    } },
    { name: '参考稿对齐：Workspace chrome 尺寸、顶部栏与 selection-only 工具栏保持桌面设计基线', run: async () => {
      const globalCss = readFileSync(path.join(process.cwd(), 'src/styles/global.css'), 'utf8');
      const editorCss = readFileSync(path.join(process.cwd(), 'src/styles/editor.css'), 'utf8');
      assert.match(globalCss, /data-sidebar-open='true'\]\[data-inspector-open='true'\]\s*\{[^}]*grid-template-columns:\s*256px\s+minmax\(0,\s*1fr\)\s+288px/s);
      assert.match(globalCss, /--workspace-topbar:\s*#fafbfc/);
      assert.match(globalCss, /\[data-theme='dark'\][\s\S]*?--workspace-topbar:\s*#13161c/);
      assert.match(globalCss, /\.workspace-topbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/s);
      assert.match(editorCss, /\.editor-toolbar\.selection-active\s*\{/);
      assert.equal(/\.editor-visual-surface:focus-within\s+\.editor-toolbar/.test(editorCss), false,
        'Formatting toolbar must not appear just because the continuous Markdown canvas was clicked');
      assert.match(editorCss, /\.flownote-editor\s+\.ProseMirror\s+h1\s*\{[^}]*font-size:\s*1\.85rem/s);
    } },
    { name: '长文档布局：滚动限制在中央编辑区而不是撑高整个 App', run: async () => {
      const globalCss = readFileSync(path.join(process.cwd(), 'src/styles/global.css'), 'utf8');
      const editorCss = readFileSync(path.join(process.cwd(), 'src/styles/editor.css'), 'utf8');
      assert.match(globalCss, /\.writing-app\s*\{[^}]*height:\s*100vh/s);
      assert.match(globalCss, /\.writing-workspace\s*\{[^}]*overflow:\s*hidden/s);
      assert.match(editorCss, /\.flownote-editor\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
      assert.match(editorCss, /\.editor-visual-surface\s*>\s*\[data-milkdown-root\]\s*\{[^}]*overflow:\s*auto/s);
    } },
    { name: '窄窗口布局：HTML 全屏保持紧凑边距和可退出画布', run: async () => {
      const css = readFileSync(path.join(process.cwd(), 'src/styles/editor.css'), 'utf8');
      assert.match(css, /@media\s*\(max-width:\s*640px\),\s*\(max-height:\s*520px\)[\s\S]*?\.html-fullscreen-canvas\s*\{[^}]*padding:\s*4px\s+6px\s+6px/s);
      assert.match(css, /@media\s*\(max-width:\s*640px\),\s*\(max-height:\s*520px\)[\s\S]*?\.html-fullscreen-canvas\s+\.html-sandbox\s*\{[^}]*border-radius:\s*8px/s);
    } },
    { name: '代码高亮：关键字和字符串着色，源码不变', run: async () => {
      await h.mount(SAMPLE);
      const keyword = document.querySelector('pre .token.keyword');
      const string = document.querySelector('pre .token.string');
      assert.ok(keyword, 'Code highlighting is not connected');
      assert.ok(string);
      assert.notEqual(getComputedStyle(keyword).color, getComputedStyle(string).color);
      assert.match(h.api.current!.getMarkdown(), /const answer = 42;/);
    } },
    { name: '撤销重做：普通输入可恢复且不丢原文', run: async () => {
      await h.mount('原文\n');
      await act(async () => h.view().dispatch(h.view().state.tr.insertText('新增', 1)));
      await act(async () => { assert.equal(undo(h.view().state, h.view().dispatch), true, 'Undo is not connected'); });
      assert.equal(h.api.current!.getMarkdown().trim(), '原文');
      await act(async () => { assert.equal(redo(h.view().state, h.view().dispatch), true); });
      await settle();
      assert.equal(h.api.current!.getMarkdown().trim(), '新增原文');
    } },
    { name: '任务列表：有可点击的复选框并保留 Markdown 状态', run: async () => {
      await h.mount('- [ ] 待办\n- [x] 完成\n');
      const boxes = document.querySelectorAll<HTMLInputElement>('.ProseMirror input[type="checkbox"]');
      assert.equal(boxes.length, 2, 'Task checkbox UI is missing');
      assert.equal(boxes[1].checked, true);
      await act(async () => boxes[0].click());
      await settle();
      assert.match(h.api.current!.getMarkdown(), /\[x\] 待办/);
    } },
  ];
}

export async function run(filter: string, context: TestContext) {
  const h = createHarness();
  const results = [];
  for (const check of [...foundationChecks(h), ...interactionChecks(h), ...toolbarChecks(h), ...regressionChecks(h, context), ...workspaceChecks]) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  await h.unmount();
  for (const check of [...appChecks, ...workspaceAppChecks]) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}
