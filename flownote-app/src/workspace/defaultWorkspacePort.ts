import { isTauri } from '@tauri-apps/api/core';
import { createNativeWorkspacePort } from './nativeWorkspacePort';
import type { WorkspacePort } from './workspaceTypes';

export function defaultWorkspacePort(): WorkspacePort | null {
  return isTauri() ? createNativeWorkspacePort() : null;
}
