export interface MarkdownFile {
  id: string;
  path: string;
  name: string;
  content: string;
  revision: string;
  readOnly: boolean;
  notice?: string;
}

export interface SaveFileRequest { id: string; revision: string; content: string }
export interface SaveAsRequest { name: string; content: string }

export interface MarkdownFilePort {
  readonly mode: 'desktop' | 'import';
  readonly canWrite: boolean;
  open(): Promise<MarkdownFile | null>;
  save(request: SaveFileRequest): Promise<MarkdownFile>;
  saveAs(request: SaveAsRequest): Promise<MarkdownFile | null>;
  reload(id: string): Promise<MarkdownFile>;
  release(id: string): Promise<void>;
}

interface RecoveryPaths { current?: string; original?: string }

export class MarkdownFileError extends Error {
  constructor(readonly code: string, message: string, private readonly paths: RecoveryPaths = {}) {
    super(message);
    this.name = 'MarkdownFileError';
  }
  get recoveryPath() { return this.paths.current; }
  get originalRecoveryPath() { return this.paths.original; }
}

function recoveryPath(cause: object, key: string): string | undefined {
  const value = (cause as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function fileError(cause: unknown): MarkdownFileError {
  if (cause instanceof MarkdownFileError) return cause;
  if (cause && typeof cause === 'object' && 'code' in cause && 'message' in cause) {
    const recovery = recoveryPath(cause, 'recoveryPath');
    const original = recoveryPath(cause, 'originalRecoveryPath');
    return new MarkdownFileError(String(cause.code), String(cause.message), { current: recovery, original });
  }
  return new MarkdownFileError('io', cause instanceof Error ? cause.message : String(cause));
}
