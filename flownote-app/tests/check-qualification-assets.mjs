import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';

const TIMEOUT_MS = 60_000;
const timer = setTimeout(() => { console.error('Asset checks exceeded 60 seconds'); process.exit(1); }, TIMEOUT_MS);
const expected = await fs.readFile(new URL('../../flownote-markdown-qualification/fixtures/qualification.assets/list-image.png', import.meta.url));
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'error',
  optimizeDeps: { noDiscovery: true, entries: [], include: [] },
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/qualification.assets/list-image.png`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /image\/png/, 'Fixture URL did not return an image');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  const head = await fetch(`${base}/qualification.assets/list-image.png`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const missing = await fetch(`${base}/qualification.assets/missing.png`);
  assert.equal(missing.status, 404);
  const traversal = await fetch(`${base}/qualification.assets/%2e%2e%2fREADME.md`);
  assert.equal(traversal.status, 404);
  console.log('4/4 asset checks passed: PNG bytes, HEAD, missing resource, path containment.');
} finally {
  await server.close();
  clearTimeout(timer);
}
