import { isTauri } from '@tauri-apps/api/core';
import { createImportFilePort } from './importFilePort';
import { createNativeFilePort } from './nativeFilePort';
import type { MarkdownFilePort } from './fileTypes';

export function defaultFilePort(): MarkdownFilePort {
  return isTauri() ? createNativeFilePort() : createImportFilePort();
}
