import { act } from 'react';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHarness, settle } from './editorHarness';
import { useNoteStore } from '../src/note/noteStore';
import { protectionInputChecks } from './protectionInputs.spec';
import { protectionAppChecks } from './protectionApp.spec';
import { protectionRegressionChecks } from './protectionRegressions.spec';
import { protectionFixtureChecks } from './protectionFixtures.spec';

type Harness = ReturnType<typeof createHarness>;
export type ProtectionCheck = { name: string; run: () => Promise<void> };
const fixture = (name: string) => readFileSync(resolve('../flownote-markdown-qualification/fixtures', name), 'utf8');

export function sourceArea(): HTMLTextAreaElement {
  const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]');
  assert.ok(field, 'Actual editable source view is missing');
  assert.notEqual(getComputedStyle(field).display, 'none');
  return field;
}

export async function changeSource(value: string): Promise<void> {
  const field = sourceArea();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function fixtureChecks(h: Harness): ProtectionCheck[] {
  return ['05-unsupported-syntax.md', '08-roundtrip-stress.md'].map(name => ({
    name: `源码保护：${name} 初始载入、重载与实际编辑保真`,
    run: async () => {
      const input = fixture(name);
      await h.mount(input);
      assert.equal(h.api.current!.getMarkdown(), input);
      assert.equal(sourceArea().value, input.replace(/\r\n?/g, '\n'));
      assert.equal(h.view().editable, false);
      await act(async () => h.api.current!.setMarkdown(h.api.current!.getMarkdown()));
      assert.equal(h.api.current!.getMarkdown(), input);
      const changed = input.replace('FlowNote', 'FlowNote 编辑验证').replace('Round-trip Stress', 'Round-trip 编辑验证');
      await changeSource(changed);
      assert.equal(h.api.current!.getMarkdown(), changed);
      await settle();
      assert.equal(h.latest(), changed);
    },
  }));
}

function boundaryChecks(h: Harness): ProtectionCheck[] {
  return [
    { name: '源码保护：空文档仍可正常可视化输入', run: async () => {
      await h.mount('');
      assert.equal(h.view().editable, true, document.querySelector('.editor-source-notice')?.textContent ?? 'Blank document is not editable');
      await act(async () => h.view().dispatch(h.view().state.tr.insertText('正文', 1)));
      await settle();
      assert.equal(h.api.current!.getMarkdown().trim(), '正文');
      assert.equal(h.latest().trim(), '正文');
    } },
    { name: '源码保护：API 装载公式、WikiLink、HTML、Footnote 与代码扩展', run: async () => {
      await h.mount('# 普通正文\n');
      const samples = ['$x^2 + y^2 = z^2$\n', '$$\nE = mc^2\n$$\n', '\\(x + y\\)\n',
        '[[Useful Skew]]\n', '<span style="color:red">红色</span>\n',
        '文字[^1]\n\n[^1]: 注释\n',
        '```mermaid\ngraph LR; A-->B\n```\n', '```js title="sample"\nlet n = 1\n```\n',
        ':::warning\n注意\n:::\n'];
      for (const input of samples) {
        await act(async () => h.api.current!.setMarkdown(input));
        assert.equal(h.api.current!.getMarkdown(), input);
        assert.equal(sourceArea().value, input);
        assert.equal(h.view().editable, false);
      }
    } },
    { name: '源码保护：源码修改即标脏，旧可视化回调不能覆盖', run: async () => {
      await h.mount('旧正文\n');
      await act(async () => h.view().dispatch(h.view().state.tr.insertText('延迟通知', 1)));
      await act(async () => h.api.current!.setMarkdown('[[新文档]]\n'));
      await act(async () => useNoteStore.getState().setDirty(false));
      await changeSource('[[新文档]]\n\n$E=mc^2$\n');
      assert.equal(useNoteStore.getState().isDirty, true);
      await settle();
      assert.equal(h.api.current!.getMarkdown(), '[[新文档]]\n\n$E=mc^2$\n');
      assert.equal(h.latest(), h.api.current!.getMarkdown());
    } },
    { name: '源码保护：危险文档不能强制可视化，移除扩展后可主动切换', run: async () => {
      await h.mount('[[保留]]\n');
      await act(async () => assert.throws(() => h.api.current!.setMode('edit'), /源码|保护/));
      assert.equal(h.api.current!.getMarkdown(), '[[保留]]\n');
      await changeSource('# 已改为普通 Markdown\n');
      await act(async () => h.api.current!.setMode('edit'));
      assert.equal(document.querySelector('.ProseMirror h1')?.textContent, '已改为普通 Markdown');
      assert.equal(h.view().editable, true);
    } },
    { name: '源码保护：普通文档可切源码，代码与转义示例不会误触保护', run: async () => {
      const input = '# 普通\n\n`[[示例]] $x$`\n\n\\[\\[字面文本]] 与 \\$x\\$\n\n```javascript\nconst value = "[[x]] $x$";\n```\n';
      await h.mount(input);
      assert.equal(h.view().editable, true);
      await act(async () => h.api.current!.setMode('source'));
      assert.match(sourceArea().value, /const value/);
      await act(async () => h.api.current!.setMode('edit'));
      assert.equal(h.view().editable, true);
    } },
    { name: '源码保护：Frontmatter 作为元数据包络保真且正文仍可可视化编辑', run: async () => {
      const prefix = '\uFEFF---\r\ntitle: FlowNote\r\ntags: [pd, notes]\r\n---\r\n\r\n';
      const input = prefix + '# 可视化正文\n\n普通段落。\n';
      await h.mount(input);
      assert.equal(h.view().editable, true, document.querySelector('.editor-source-notice')?.textContent ?? 'Frontmatter unexpectedly protected');
      assert.equal(document.querySelector('.ProseMirror h1')?.textContent, '可视化正文');
      assert.ok(h.api.current!.getMarkdown().startsWith(prefix), 'Frontmatter bytes/separator were not preserved');
      await act(async () => h.view().dispatch(h.view().state.tr.insertText('新', 1)));
      await settle();
      assert.ok(h.api.current!.getMarkdown().startsWith(prefix), 'Visual edit changed Frontmatter bytes');
      assert.match(h.api.current!.getMarkdown(), /# 新可视化正文/);
    } },
    { name: '源码保护：任意 fenced code language 作为普通代码块安全往返', run: async () => {
      const input = '# HDL\n\n```systemverilog\nmodule top; endmodule\n```\n';
      await h.mount(input);
      assert.equal(h.view().editable, true, document.querySelector('.editor-source-notice')?.textContent ?? 'Custom code language unexpectedly protected');
      assert.match(h.api.current!.getMarkdown(), /```systemverilog\nmodule top; endmodule/);
    } },
    { name: '源码保护：文首普通分隔线不误判 Frontmatter，未闭合元数据仍保护', run: async () => {
      await h.mount('---\n\n# 普通正文\n');
      assert.equal(h.view().editable, true);
      assert.ok(document.querySelector('.ProseMirror hr'));
      await act(async () => h.api.current!.setMarkdown('---\ntitle: missing close\n\n# Body\n'));
      assert.equal(h.view().editable, false);
      assert.match(document.querySelector('.editor-source-notice')?.textContent ?? '', /Frontmatter 元数据未闭合/);
    } },
    { name: '源码保护：CRLF、BOM 与局部编辑保留未改动的源码', run: async () => {
      const input = '\uFEFF---\r\ntitle: 原标题\r\n---\r\n\r\n[[保留]]\r\n';
      await h.mount(input);
      assert.equal(h.api.current!.getMarkdown(), input);
      await changeSource(sourceArea().value.replace('原标题', '新标题'));
      assert.equal(h.api.current!.getMarkdown(), input.replace('原标题', '新标题'));
    } },
  ];
}

export async function run(filter: string) {
  const h = createHarness();
  const results = [];
  for (const check of [...fixtureChecks(h), ...boundaryChecks(h), ...protectionInputChecks(h),
    ...protectionRegressionChecks(h), ...protectionFixtureChecks(h)]) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  await h.unmount();
  for (const check of protectionAppChecks) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}
