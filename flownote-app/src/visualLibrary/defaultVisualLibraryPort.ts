import { isTauri } from '@tauri-apps/api/core';
import { createNativeVisualLibraryPort } from './nativeVisualLibraryPort';
import type { VisualLibraryPort } from './types';

export function defaultVisualLibraryPort(): VisualLibraryPort | null {
  return isTauri() ? createNativeVisualLibraryPort() : null;
}
