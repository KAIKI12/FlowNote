export type WorkspaceEntryKind = 'folder' | 'markdown' | 'note';

export interface WorkspaceEntry {
  name: string;
  relativePath: string;
  kind: WorkspaceEntryKind;
  children: WorkspaceEntry[];
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  name: string;
  entries: WorkspaceEntry[];
}

export interface WorkspaceSearchResult {
  relativePath: string;
  kind: Exclude<WorkspaceEntryKind, 'folder'>;
  title: string;
  snippet: string;
}

export interface WorkspaceMutation {
  relativePath: string;
}

export interface WorkspaceTrashItem {
  id: string;
  originalRelativePath: string;
  name: string;
  kind: WorkspaceEntryKind;
  deletedAtMs: number;
}

export interface WorkspacePort {
  restore(): Promise<WorkspaceSnapshot | null>;
  pick(): Promise<WorkspaceSnapshot | null>;
  scan(): Promise<WorkspaceSnapshot>;
  search(query: string): Promise<WorkspaceSearchResult[]>;
  createMarkdown(folder: string): Promise<WorkspaceMutation>;
  rename(relativePath: string, newName: string): Promise<WorkspaceMutation>;
  trash(relativePath: string): Promise<WorkspaceTrashItem>;
  listTrash(): Promise<WorkspaceTrashItem[]>;
  restoreTrash(id: string): Promise<WorkspaceMutation>;
  deleteTrash(id: string): Promise<void>;
}
