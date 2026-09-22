export type LocalizedResourceType = 'script' | 'stylesheet' | 'image' | 'style-asset';

export interface LocalizedResource {
  source: string;
  path: string;
  type: LocalizedResourceType;
  mime: string;
  sha256: string;
}

export interface LocalizationIssue {
  source: string;
  reason: string;
}

export interface HtmlResourceMetadata {
  localized?: LocalizedResource[];
  localizationIssues?: LocalizationIssue[];
  [key: string]: unknown;
}

export interface HtmlBlockConfig {
  kind: 'html';
  inputKind: 'fragment' | 'document';
  scriptPolicy: 'off' | 'sandbox';
  viewport: { heightPx: number; [key: string]: unknown };
  resources?: HtmlResourceMetadata;
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
