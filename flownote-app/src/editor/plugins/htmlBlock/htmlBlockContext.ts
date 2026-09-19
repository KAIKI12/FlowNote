import { $ctx } from '@milkdown/utils';
import type { EditorSession } from '../../editorSession';
import type { HtmlBlockData } from '../../../note/mixedTypes';
import type { BlockAsset } from '../../../note/nativeNotePort';

export interface HtmlBlockHost {
  knownIds(): ReadonlySet<string> | undefined;
  read(id: string): HtmlBlockData | undefined;
  readAsset?(id: string, path: string): Promise<BlockAsset>;
  duplicate?(id: string): void | Promise<unknown>;
  select?(id: string): void;
  update(block: HtmlBlockData): void;
  subscribe(listener: () => void): () => void;
}

export interface HtmlBlockContext { host: HtmlBlockHost; session: EditorSession }
export const htmlBlockContext = $ctx<HtmlBlockContext | null, 'flowNoteHtmlBlocks'>(null, 'flowNoteHtmlBlocks');
