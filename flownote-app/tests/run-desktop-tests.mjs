import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const BUILD_TIMEOUT_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 60_000;
const compile = spawnSync('cargo', ['test', '--offline', '--test', 'desktop_commands', '--test', 'file_driver', '--no-run', '--message-format=json'], {
  cwd: path.join(appRoot, 'src-tauri'), encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, windowsHide: true,
});
if (compile.status !== 0) { console.error(compile.error ?? compile.stderr); process.exit(1); }
const messages = compile.stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const artifact = name => {
  const found = messages.find(message => message.reason === 'compiler-artifact' && message.profile.test
    && message.target.name === name && message.executable);
  if (!found) throw new Error(`Missing Rust test artifact: ${name}`);
  return found.executable;
};
const rust = spawnSync(artifact('desktop_commands'), ['--test-threads=1'], {
  cwd: appRoot, encoding: 'utf8', timeout: TEST_TIMEOUT_MS, windowsHide: true,
});
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'flownote-desktop-ipc-'));
fs.writeFileSync(path.join(evidence, 'rust.log'), (rust.stdout ?? '') + (rust.stderr ?? ''));
console.log(rust.stdout);
if (rust.stderr) console.error(rust.stderr);
console.log(`Rust IPC evidence: ${evidence}`);
if (rust.status !== 0) { if (rust.error) console.error(rust.error); process.exit(1); }
const result = spawnSync(process.execPath, ['tests/run-stage-one.mjs', '--desktop', ...process.argv.slice(2)], {
  cwd: appRoot, stdio: 'inherit', windowsHide: true, timeout: TEST_TIMEOUT_MS,
  env: { ...process.env, FLOWNOTE_FILE_DRIVER: artifact('file_driver') },
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
