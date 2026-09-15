import { $ctx } from '@milkdown/utils';
import type { EditorSession } from '../../editorSession';
import type { HtmlBlockData } from '../../../note/mixedTypes';

export interface HtmlBlockHost {
  knownIds(): ReadonlySet<string> | undefined;
  read(id: string): HtmlBlockData | undefined;
  update(block: HtmlBlockData): void;
  subscribe(listener: () => void): () => void;
}

export interface HtmlBlockContext { host: HtmlBlockHost; session: EditorSession }
export const htmlBlockContext = $ctx<HtmlBlockContext | null, 'flowNoteHtmlBlocks'>(null, 'flowNoteHtmlBlocks');
