import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const started = Date.now();
const disk = spawnSync(process.execPath, ['tests/run-file-disk.mjs', 'Markdown Export 真实磁盘'], {
  cwd: appRoot, stdio: 'inherit', windowsHide: true, timeout: 3 * 60_000,
});
if (disk.error || disk.status !== 0) {
  if (disk.error) console.error(disk.error);
  process.exit(disk.status ?? 1);
}

const candidates = readdirSync(os.tmpdir(), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name.startsWith('flownote-editor-disk-'))
  .map(entry => path.join(os.tmpdir(), entry.name))
  .filter(directory => {
    try { return statSync(directory).mtimeMs >= started - 2000; } catch { return false; }
  })
  .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

const exportRoot = candidates
  .map(directory => path.join(directory, 'markdown-exports', 'Slice 3 Disk-markdown-export'))
  .find(directory => existsSync(path.join(directory, 'Slice 3 Disk.md')));
if (!exportRoot) throw new Error('Markdown export qualification could not locate the fresh real-disk export');

const markdown = readFileSync(path.join(exportRoot, 'Slice 3 Disk.md'), 'utf8');
const blockId = '0199a111-0000-7000-8000-000000000001';
if (!markdown.includes('./blocks/' + blockId + '/index.html')) {
  throw new Error('Markdown export did not preserve the external HTML link');
}
if (markdown.includes('flownote-html')) {
  throw new Error('Markdown export leaked FlowNote-only HTML anchor syntax');
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find(existsSync);
if (!browser) throw new Error('Chrome/Edge is required for Markdown export file:// qualification');

const profile = path.join(os.tmpdir(), 'flownote-markdown-export-qual-' + crypto.randomUUID());
const blockFile = path.join(exportRoot, 'blocks', blockId, 'index.html');
const result = spawnSync(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile,
  '--virtual-time-budget=2000', '--dump-dom', '--enable-logging=stderr', '--v=0',
  pathToFileURL(blockFile).href,
], { cwd: appRoot, encoding: 'utf8', windowsHide: true, timeout: 60_000 });

if (result.error || result.status !== 0) {
  console.error(result.stderr);
  throw result.error ?? new Error('Headless browser exited ' + result.status);
}
if (result.stderr.includes('Not allowed to load local resource')) {
  throw new Error('Markdown export Block attempted a blocked file:// managed resource load');
}
if (!/data-script=["']ok["']/.test(result.stdout)) throw new Error('Markdown export classic JS did not execute');
if (!/data-css=["']rgb\(1, 2, 3\)["']/.test(result.stdout)) throw new Error('Markdown export managed CSS did not apply');
if (!/data-image=["']ok["']/.test(result.stdout)) throw new Error('Markdown export managed image did not load');

console.log('MARKDOWN EXPORT FILE QUALIFICATION PASS');
console.log('Browser:', browser);
console.log('Export:', exportRoot);
