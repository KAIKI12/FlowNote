import { MarkdownFileError } from './fileTypes';
import type { MarkdownFilePort } from './fileTypes';
import { contentRevision, readBrowserMarkdown } from './fileEncoding';

function selectFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown';
    input.hidden = true;
    input.setAttribute('aria-label', '选择 Markdown 文件');
    const finish = (file: File | null) => { input.remove(); resolve(file); };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

function unavailable(): never {
  throw new MarkdownFileError('unsupported', '网页模式请使用「导出 Markdown」；原位保存请使用 Windows 桌面版');
}

export function createImportFilePort(pick: () => Promise<File | null> = selectFile): MarkdownFilePort {
  return { mode: 'import', canWrite: false,
    async open() {
      const file = await pick();
      if (!file) return null;
      const content = await readBrowserMarkdown(file);
      return { id: crypto.randomUUID(), path: file.name, name: file.name, content,
        revision: await contentRevision(content), readOnly: true };
    },
    async save() { return unavailable(); },
    async saveAs() { return unavailable(); },
    async reload() { throw new MarkdownFileError('unsupported', '网页模式请重新选择文件，以读取最新磁盘内容'); },
    async release() { /* Imported File objects hold no writable or persistent file capability. */ },
  };
}
