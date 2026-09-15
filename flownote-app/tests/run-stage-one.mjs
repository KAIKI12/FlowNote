import { JSDOM, VirtualConsole } from 'jsdom';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_TIMEOUT_MS = 60_000;
const option = process.argv[2];
const suite = option === '--html' ? 'html' : option === '--desktop' ? 'desktop' : option === '--file-disk' ? 'file-disk' : option === '--files' ? 'files'
  : option === '--qualification' ? 'qualification' : option === '--protection' ? 'protection' : 'stage-one';
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), `flownote-${suite}-`));
const timer = setTimeout(() => { console.error('Tests exceeded 60 seconds'); process.exit(1); }, TEST_TIMEOUT_MS);
const virtualConsole = new VirtualConsole();
const domErrors = [];
virtualConsole.on('jsdomError', error => domErrors.push(error.message));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:1420/', pretendToBeVisual: true, virtualConsole,
});

function installDom() {
  const names = ['document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
    'HTMLTextAreaElement', 'HTMLSelectElement', 'MutationObserver', 'DOMParser', 'DOMRect',
    'File', 'FileReader', 'Event', 'CustomEvent', 'InputEvent', 'MouseEvent', 'KeyboardEvent',
    'CompositionEvent', 'AbortController', 'AbortSignal', 'ShadowRoot'];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  const methods = ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'addEventListener', 'removeEventListener', 'dispatchEvent', 'getSelection'];
  for (const name of methods) globalThis[name] = dom.window[name].bind(dom.window);
  globalThis.innerHeight = dom.window.innerHeight;
  globalThis.innerWidth = dom.window.innerWidth;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout engine. These adapters only enable logical keyboard tests.
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
  dom.window.scrollBy = () => {};
}

async function installStyles() {
  const styles = await Promise.all(['editor.css', 'slashmenu.css', 'global.css'].map(name =>
    fs.readFile(path.join(appRoot, 'src/styles', name), 'utf8')));
  const element = document.createElement('style');
  element.textContent = styles.join('\n').replace(/^@import[^;]+;\s*/gm, '');
  document.head.append(element);
}

try {
  installDom();
  await installStyles();
  const outfile = path.join(artifacts, `${suite}.mjs`);
  await build({ entryPoints: [path.join(appRoot, `tests/${suite}.spec.tsx`)], outfile,
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true' } });
  const { run } = await import(pathToFileURL(outfile).href);
  const results = await run(process.argv[suite === 'stage-one' ? 2 : 3] ?? '', { setUrl: url => dom.reconfigure({ url }) });
  const report = { scope: suite === 'desktop' ? 'App + Tauri JavaScript window/event APIs + Rust file service; OS events/destruction substituted'
    : suite === 'file-disk' ? 'App + actual editor + NativeFilePort + production Rust FileStore + temporary disk files'
    : `${suite}: editing, DOM and computed styles`, nativePickerLayoutAndIME: 'not tested', results, domErrors };
  const reportPath = path.join(artifacts, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  for (const result of results) console.log(`${result.status.toUpperCase()} ${result.name}${result.error ? ': ' + result.error : ''}`);
  console.log(`${results.filter(result => result.status === 'passed').length}/${results.length} passed. Report: ${reportPath}`);
  if (domErrors.length) console.error(domErrors);
  process.exitCode = results.some(result => result.status !== 'passed') || domErrors.length ? 1 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  dom.window.close();
  clearTimeout(timer);
  process.exit(process.exitCode ?? 0);
}
