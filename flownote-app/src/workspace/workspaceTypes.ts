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

export interface WorkspacePort {
  restore(): Promise<WorkspaceSnapshot | null>;
  pick(): Promise<WorkspaceSnapshot | null>;
  scan(): Promise<WorkspaceSnapshot>;
  search(query: string): Promise<WorkspaceSearchResult[]>;
  createMarkdown(folder: string): Promise<WorkspaceMutation>;
  rename(relativePath: string, newName: string): Promise<WorkspaceMutation>;
}
