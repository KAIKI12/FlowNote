export interface HtmlBlockConfig {
  kind: 'html';
  inputKind: 'fragment' | 'document';
  scriptPolicy: 'off' | 'sandbox';
  viewport: { heightPx: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface HtmlBlockData {
  id: string;
  html: string;
  originalHtml: string;
  config: HtmlBlockConfig;
}

export interface MixedNoteMetadata {
  formatVersion: number;
  type: 'mixed';
  title: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface MixedNoteData {
  metadata: MixedNoteMetadata;
  blocks: HtmlBlockData[];
}
