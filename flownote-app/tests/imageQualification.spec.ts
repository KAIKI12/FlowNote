import { act } from 'react';
import assert from 'node:assert/strict';
import type { TestContext } from './editorRegressions.spec';
import type { Harness, QualificationCheck } from './qualification.spec';
import { IMAGE_PATH } from './qualification.spec';

async function imageText(h: Harness) {
  for (const path of ['assets/图片 (1).png', '../assets/chart.png', 'https://example.test/chart.png?size=2']) {
    await h.mount('前文\n');
    await h.select('前文');
    await act(async () => h.api.current!.insertImage(path, '图 [A] 与 "B" <说明>'));
    const markdown = h.api.current!.getMarkdown();
    await act(async () => h.api.current!.setMarkdown(markdown));
    const image = document.querySelector('.ProseMirror img');
    assert.equal(image?.getAttribute('src'), path);
    assert.equal(image?.getAttribute('alt'), '图 [A] 与 "B" <说明>');
    assert.equal(h.view().editable, true, `${markdown}\n${document.querySelector('.editor-source-notice')?.textContent}`);
  }
}

async function imageValidation(h: Harness) {
  await h.mount('原文\n');
  const before = h.api.current!.getMarkdown();
  for (const source of ['', 'javascript:alert(1)', 'data:text/html,test', 'blob:temporary', 'file:///C:/image.png', 'java\tscript:alert(1)']) {
    await act(async () => assert.throws(() => h.api.current!.insertImage(source), /图片地址|http|HTTPS/));
    assert.equal(h.api.current!.getMarkdown(), before);
  }
}

async function imageModes(h: Harness) {
  await h.mount('[[源码保护]]\n');
  const oldTree = h.view().state.doc.toJSON();
  await act(async () => assert.throws(() => h.api.current!.insertImage(IMAGE_PATH), /源码保护|只读/));
  assert.deepEqual(h.view().state.doc.toJSON(), oldTree);
  await h.mount('只读正文\n');
  await act(async () => h.api.current!.setMode('read'));
  await act(async () => assert.throws(() => h.api.current!.insertImage(IMAGE_PATH), /只读/));
  assert.equal(document.querySelector('.ProseMirror img'), null);
}

async function imageComposition(h: Harness) {
  await h.mount('- 输入中\n');
  await act(async () => h.view().dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  try {
    await act(async () => assert.throws(() => h.api.current!.insertImage(IMAGE_PATH), /组合输入/));
    assert.equal(document.querySelector<HTMLButtonElement>('button[aria-label="插入图片"]')?.disabled, true);
    assert.equal(document.querySelector('.ProseMirror img'), null);
  } finally { await act(async () => h.view().dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))); }
}

async function imageInCode(h: Harness) {
  for (const source of ['```javascript\nconst a = 1;\n```\n', '`const a = 1;`\n']) {
    await h.mount(source);
    await h.select('onst');
    const before = h.api.current!.getMarkdown();
    await act(async () => assert.throws(() => h.api.current!.insertImage(IMAGE_PATH), /选择范围|代码/));
    assert.equal(h.api.current!.getMarkdown(), before);
  }
}

async function tauriImage(h: Harness, context: TestContext) {
  context.setUrl('tauri://localhost/');
  try {
    await h.mount('图片\n');
    await h.select('图片', true);
    await act(async () => h.api.current!.insertImage('../assets/image.png', '本地图片'));
    assert.equal(document.querySelector('.ProseMirror img')?.getAttribute('src'), '../assets/image.png');
  } finally { context.setUrl('http://127.0.0.1:1420/'); }
}

export function imageQualificationChecks(h: Harness, context: TestContext): QualificationCheck[] {
  return [
    { name: '图片边界：带空格路径和特殊替代文字可以往返', run: () => imageText(h) },
    { name: '图片边界：非法或不可持久引用的地址不会修改正文', run: () => imageValidation(h) },
    { name: '图片边界：源码和只读模式不会修改隐藏文档', run: () => imageModes(h) },
    { name: '图片边界：组合输入期间禁止插入并禁用按钮', run: () => imageComposition(h) },
    { name: '图片边界：不能把图片塞进代码块并改变内容', run: () => imageInCode(h) },
    { name: '图片边界：Tauri 环境中保留相对路径', run: () => tauriImage(h, context) },
  ];
}
