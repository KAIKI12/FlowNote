import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const steps = [
  {
    name: 'Native format freeze',
    command: 'cargo',
    args: ['test', '--offline', '--manifest-path', 'src-tauri/Cargo.toml', '--test', 'format_freeze', '--', '--test-threads=1'],
    timeout: 3 * 60_000,
  },
  {
    name: 'Native Note format',
    command: 'cargo',
    args: ['test', '--offline', '--manifest-path', 'src-tauri/Cargo.toml', '--test', 'note_files', '--', '--test-threads=1'],
    timeout: 3 * 60_000,
  },
  {
    name: 'Atomic Note recovery',
    command: 'cargo',
    args: ['test', '--offline', '--manifest-path', 'src-tauri/Cargo.toml', '--lib', 'windows_note_save::tests', '--', '--test-threads=1'],
    timeout: 3 * 60_000,
  },
  {
    name: 'Editor-to-disk format roundtrip',
    command: process.execPath,
    args: ['tests/run-file-disk.mjs'],
    timeout: 3 * 60_000,
  },
  {
    name: 'Mixed Note lifecycle / IME',
    command: process.execPath,
    args: ['tests/run-stage-one.mjs'],
    timeout: 2 * 60_000,
  },
  {
    name: 'Unsupported Markdown protection',
    command: process.execPath,
    args: ['tests/run-stage-one.mjs', '--protection'],
    timeout: 2 * 60_000,
  },
  {
    name: 'HTML anchor / Current / Original',
    command: process.execPath,
    args: ['tests/run-stage-one.mjs', '--html'],
    timeout: 2 * 60_000,
  },
];

for (const step of steps) {
  console.log(`\n=== Format Freeze: ${step.name} ===`);
  const result = spawnSync(step.command, step.args, {
    cwd: path.resolve(appRoot),
    stdio: 'inherit',
    windowsHide: true,
    timeout: step.timeout,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nFORMAT FREEZE PASS');
