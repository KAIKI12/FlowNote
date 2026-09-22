import type { HtmlBlockConfig } from '../note/mixedTypes';
import type { BlockAsset } from '../note/nativeNotePort';

export interface VisualLibraryItem {
  id: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
  favorite: boolean;
  tags: string[];
  trashed: boolean;
  html: string;
  config: HtmlBlockConfig;
  assetCount: number;
}

export interface VisualLibraryPackage {
  item: VisualLibraryItem;
  originalHtml: string;
  assets: BlockAsset[];
}

export interface VisualMetadataUpdate {
  id: string;
  title: string;
  favorite: boolean;
  tags: string[];
}

export interface VisualLibraryPort {
  list(): Promise<VisualLibraryItem[]>;
  collect(request: { noteId: string; revision: string; blockId: string; title: string }): Promise<VisualLibraryItem>;
  load(id: string): Promise<VisualLibraryPackage>;
  readAsset(id: string, path: string): Promise<BlockAsset>;
  update(request: VisualMetadataUpdate): Promise<VisualLibraryItem>;
  trash(id: string): Promise<VisualLibraryItem>;
  restore(id: string): Promise<VisualLibraryItem>;
}
