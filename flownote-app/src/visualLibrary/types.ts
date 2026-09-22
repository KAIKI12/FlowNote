import type { HtmlBlockConfig } from '../note/mixedTypes';
import type { BlockAsset } from '../note/nativeNotePort';

export interface VisualLibraryItem {
  id: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
  html: string;
  config: HtmlBlockConfig;
  assetCount: number;
}

export interface VisualLibraryPackage {
  item: VisualLibraryItem;
  originalHtml: string;
  assets: BlockAsset[];
}

export interface VisualLibraryPort {
  list(): Promise<VisualLibraryItem[]>;
  collect(request: { noteId: string; revision: string; blockId: string; title: string }): Promise<VisualLibraryItem>;
  load(id: string): Promise<VisualLibraryPackage>;
  readAsset(id: string, path: string): Promise<BlockAsset>;
}
