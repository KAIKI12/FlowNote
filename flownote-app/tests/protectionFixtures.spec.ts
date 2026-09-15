import { act } from 'react';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { remarkCtx } from '@milkdown/core';
import { createHarness } from './editorHarness';
import { sourceArea } from './protection.spec';

const fixtureRoot = resolve('../flownote-markdown-qualification/fixtures');
const fixtures = readdirSync(fixtureRoot).filter(name => name.endsWith('.md')).sort();

function semanticTree(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => ['position', 'spread'].includes(key) ? undefined : entry));
}

export function protectionFixtureChecks(h: ReturnType<typeof createHarness>) {
  return fixtures.map(name => ({ name: `资格样例：${name} 载入与两次往返`, run: async () => {
    const source = readFileSync(resolve(fixtureRoot, name), 'utf8');
    await h.mount(source);
    const protectedSource = document.querySelector('.flownote-editor')!.getAttribute('data-active-editor') === 'source';
    const parser = h.editor().ctx.get(remarkCtx);
    const originalTree = semanticTree(parser.parse(source));
    for (let round = 0; round < 2; round += 1) {
      const output = h.api.current!.getMarkdown();
      if (protectedSource) {
        assert.equal(output, source);
        assert.equal(sourceArea().value, source.replace(/\r\n?/g, '\n'));
      } else assert.deepEqual(semanticTree(parser.parse(output)), originalTree);
      await act(async () => h.api.current!.setMarkdown(output));
    }
  } }));
}
