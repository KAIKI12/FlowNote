import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const started = Date.now();
const disk = spawnSync(process.execPath, ['tests/run-file-disk.mjs', 'Browser Bundle 真实磁盘'], {
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

const bundleRoot = candidates.map(directory => path.join(directory, 'browser-exports', 'Slice 3 Disk-export'))
  .find(directory => existsSync(path.join(directory, 'index.html')));
if (!bundleRoot) throw new Error('Browser Bundle qualification could not locate the fresh real-disk export');

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find(existsSync);
if (!browser) throw new Error('Chrome/Edge is required for Browser Bundle file:// qualification');

function dump(file, logging = false) {
  const profile = path.join(os.tmpdir(), 'flownote-browser-qual-' + crypto.randomUUID());
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile,
    '--virtual-time-budget=2000', '--dump-dom',
  ];
  if (logging) args.push('--enable-logging=stderr', '--v=0');
  args.push(pathToFileURL(file).href);
  const result = spawnSync(browser, args, { cwd: appRoot, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (result.error || result.status !== 0) {
    console.error(result.stderr);
    throw result.error ?? new Error('Headless browser exited ' + result.status);
  }
  return { dom: result.stdout, log: result.stderr };
}

const root = dump(path.join(bundleRoot, 'index.html'), true);
if (!root.dom.includes('./blocks/0199a111-0000-7000-8000-000000000001/index.html')) {
  throw new Error('Browser Bundle root file:// page did not preserve the HTML Block iframe reference');
}
if (root.log.includes('Not allowed to load local resource')) {
  throw new Error('Sandboxed Browser Bundle iframe attempted a blocked file:// resource load');
}
if (!root.log.includes('FLOWNOTE_BROWSER_BUNDLE_OK rgb(1, 2, 3) ok')) {
  throw new Error('Sandboxed root page did not execute its managed CSS / classic JS / image qualification');
}

const block = dump(path.join(bundleRoot, 'blocks', '0199a111-0000-7000-8000-000000000001', 'index.html'));
if (!/data-script=["']ok["']/.test(block.dom)) throw new Error('Classic JS did not execute in exported Block document');
if (!/data-css=["']rgb\(1, 2, 3\)["']/.test(block.dom)) throw new Error('Managed CSS did not apply under Browser Bundle CSP');
if (!/data-image=["']ok["']/.test(block.dom)) throw new Error('Managed image did not load under Browser Bundle CSP');

console.log('BROWSER BUNDLE FILE QUALIFICATION PASS');
console.log('Browser:', browser);
console.log('Bundle:', bundleRoot);
