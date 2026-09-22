import { $ctx } from '@milkdown/utils';
import type { EditorSession } from '../../editorSession';
import type { HtmlBlockData } from '../../../note/mixedTypes';
import type { BlockAsset, BlockAssetEdit, BlockAssetInfo } from '../../../note/nativeNotePort';

export interface HtmlBlockHost {
  knownIds(): ReadonlySet<string> | undefined;
  read(id: string): HtmlBlockData | undefined;
  readAsset?(id: string, path: string): Promise<BlockAsset>;
  listAssets?(id: string): Promise<BlockAssetInfo[]>;
  commitFullEditor?(id: string, html: string, edits: BlockAssetEdit[]): Promise<boolean>;
  duplicate?(id: string): void | Promise<unknown>;
  collect?(id: string): void | Promise<unknown>;
  select?(id: string): void;
  update(block: HtmlBlockData): void;
  subscribe(listener: () => void): () => void;
}

export interface HtmlBlockContext { host: HtmlBlockHost; session: EditorSession }
export const htmlBlockContext = $ctx<HtmlBlockContext | null, 'flowNoteHtmlBlocks'>(null, 'flowNoteHtmlBlocks');
