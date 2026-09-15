import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const BUILD_TIMEOUT_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 60_000;
const compile = spawnSync('cargo', ['test', '--offline', '--test', 'file_driver', '--no-run', '--message-format=json'], {
  cwd: path.join(appRoot, 'src-tauri'), encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, windowsHide: true,
});
if (compile.status !== 0) {
  console.error(compile.error ?? compile.stderr);
  process.exit(1);
}
const messages = compile.stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const driver = messages.find(message => message.reason === 'compiler-artifact' && message.profile.test
  && message.target.name === 'file_driver' && message.executable);
if (!driver) throw new Error('Cargo did not produce the requested test artifact');
console.log('Rust file driver compiled. Running editor-to-disk checks.');
const result = spawnSync(process.execPath, ['tests/run-stage-one.mjs', '--file-disk', ...process.argv.slice(2)], {
  cwd: appRoot, stdio: 'inherit', windowsHide: true, timeout: TEST_TIMEOUT_MS,
  env: { ...process.env, FLOWNOTE_FILE_DRIVER: driver.executable },
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
