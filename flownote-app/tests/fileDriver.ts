import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createNativeFilePort } from '../src/files/nativeFilePort';
import type { FileInvoke } from '../src/files/nativeFilePort';
import { createNativeNotePort } from '../src/note/nativeNotePort';
import { createNativeVisualLibraryPort } from '../src/visualLibrary/nativeVisualLibraryPort';

const RESPONSE_PREFIX = 'FLOWNOTE_FILE_RESULT ';
const REQUEST_TIMEOUT_MS = 5000;
interface Pending { resolve: (value: unknown) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }

function startTransport() {
  const executable = process.env.FLOWNOTE_FILE_DRIVER;
  if (!executable) throw new Error('Compile the Rust test driver with npm run test:files:disk');
  const child = spawn(executable, ['--ignored', '--nocapture', '--exact', 'stdio_file_driver'], { windowsHide: true, stdio: 'pipe' });
  const pending = new Map<number, Pending>();
  let sequence = 0;
  let errors = '';
  child.stderr.on('data', chunk => { errors += String(chunk); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    if (!line.startsWith(RESPONSE_PREFIX)) return;
    const result = JSON.parse(line.slice(RESPONSE_PREFIX.length));
    const request = pending.get(result.sequence);
    if (!request) throw new Error('Rust driver returned an unknown request');
    pending.delete(result.sequence);
    clearTimeout(request.timer);
    if (result.ok) request.resolve(result.value); else request.reject(result.error);
  });
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(errors || 'Rust test process exited')); }
      pending.clear();
      if (code === 0) resolve(); else reject(new Error(`Rust test process exited ${code}: ${errors}`));
    });
  });
  const send = (message: object): Promise<unknown> => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Rust file request exceeded 5 seconds')); }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ ...message, sequence: id }) + '\n');
  });
  return { send, close: async () => { child.stdin.end(); await closed; lines.close(); } };
}

export function createFileDriver() {
  const transport = startTransport();
  const opens: (string | null)[] = [];
  const saves: (string | null)[] = [];
  const noteOpens: (string | null)[] = [];
  const noteSaves: (string | null)[] = [];
  const bundleExports: (string | null)[] = [];
  const markdownExports: (string | null)[] = [];
  let visualRoot: string | null = null;
  const calls: string[] = [];
  const invoke: FileInvoke = (command, args = {}) => {
    calls.push(command);
    const choices = command === 'markdown_open' ? opens : command === 'markdown_save_as' ? saves
      : command === 'note_open' ? noteOpens : command === 'note_save_as' ? noteSaves
        : command === 'note_export_browser_bundle' ? bundleExports
          : command === 'note_export_markdown' ? markdownExports : undefined;
    if (choices && !choices.length) throw new Error(`No test picker selection queued for ${command}`);
    const selection = command.startsWith('visual_library_') ? visualRoot : choices?.shift() ?? null;
    if (command.startsWith('visual_library_') && !selection) throw new Error('No Visual Library test root configured');
    return transport.send({ command, args, selection });
  };
  return { port: createNativeFilePort(invoke), notePort: createNativeNotePort(invoke),
    visualPort: createNativeVisualLibraryPort(invoke), invoke, calls, close: transport.close,
    open: (path: string | null) => { opens.push(path); }, saveAs: (path: string | null) => { saves.push(path); },
    noteOpen: (path: string | null) => { noteOpens.push(path); }, noteSaveAs: (path: string | null) => { noteSaves.push(path); },
    browserExport: (path: string | null) => { bundleExports.push(path); },
    markdownExport: (path: string | null) => { markdownExports.push(path); },
    visualLibraryRoot: (path: string) => { visualRoot = path; } };
}
