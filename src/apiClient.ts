/**
 * API Client
 * 
 * Provides a unified interface for Tauri command invocation.
 * Replaces the old HTTP-based API calls.
 */

import { invoke } from '@tauri-apps/api/core';

export type FolderInfo = {
  id: number;
  path: string;
};

export type ImageHistory = {
  history: ImageHistoryItem[];
  currentIndex: number;
};

export type ImageHistoryItem = {
  imageId: number;
  orderIndex: number;
  path: string;
};

export type FolderHistory = {
  history: FolderHistoryItem[];
  currentIndex: number;
};

export type FolderHistoryItem = {
  id: number;
  path: string;
  imageCount: number;
};

export type ImageState = {
  verticalMirror: boolean;
  horizontalMirror: boolean;
  greyscale: boolean;
  timerFlowMode: 'random' | 'normal';
  showFolderHistoryPanel: boolean;
  showTopControls: boolean;
  showImageHistoryPanel: boolean;
  showBottomControls: boolean;
  isFullscreenImage: boolean;
  shortcutHintsVisible: boolean;
  shortcutHintSide: 'left' | 'right';
};

// Folder operations
export async function pickFolder(path: string): Promise<FolderInfo> {
  return await invoke('pick_folder', { path });
}

export async function getNextFolder(): Promise<FolderInfo | null> {
  return await invoke('next_folder');
}

export async function getPrevFolder(): Promise<FolderInfo | null> {
  return await invoke('prev_folder');
}

export async function getFolderHistory(): Promise<FolderHistory> {
  return await invoke('get_folder_history');
}

export async function reindexCurrentFolder(): Promise<FolderInfo> {
  return await invoke('reindex_current_folder');
}

export type ImageResponse = {
  data: number[];
  folder: FolderInfo | null;
  auto_switched_folder: boolean;
};

// Image traversal - Normal mode
export async function getCurrentImage(): Promise<ImageResponse> {
  return await invoke<ImageResponse>('get_current_image');
}

export async function getNextImage(): Promise<ImageResponse> {
  return await invoke<ImageResponse>('get_next_image');
}

export async function getPrevImage(): Promise<ImageResponse> {
  return await invoke<ImageResponse>('get_prev_image');
}

// Image traversal - Random mode
export async function getNextRandomImage(): Promise<ImageResponse> {
  return await invoke<ImageResponse>('get_next_random_image');
}

export async function getPrevRandomImage(): Promise<ImageResponse> {
  return await invoke<ImageResponse>('get_prev_random_image');
}

export async function getForceRandomImage(): Promise<ImageResponse> {
  return await invoke<ImageResponse>('get_force_random_image');
}

// History operations
export async function getNormalHistory(): Promise<ImageHistory> {
  return await invoke('get_normal_history');
}

export async function getRandomHistory(): Promise<ImageHistory> {
  return await invoke('get_random_history');
}

export async function resetNormalHistory(): Promise<void> {
  await invoke('reset_normal_history');
}

export async function resetRandomHistory(): Promise<void> {
  await invoke('reset_random_history');
}

// State operations
export async function getImageState(): Promise<ImageState> {
  return await invoke('get_image_state');
}

export async function setImageState(state: ImageState): Promise<void> {
  await invoke('set_image_state', { state });
}

// Destructive operations
export async function fullWipe(): Promise<void> {
  await invoke('full_wipe');
}

export async function isHealthy(): Promise<boolean> {
  try {
    return await invoke('is_healthy');
  } catch {
    return false;
  }
}

// Jump to specific index in history
export async function setFolderByIndex(index: number): Promise<FolderInfo> {
  return await invoke('set_folder_by_index', { index });
}

export async function setNormalImageByIndex(index: number): Promise<ImageResponse> {
  return await invoke<ImageResponse>('set_normal_image_by_index', { index });
}

export async function setRandomImageByIndex(index: number): Promise<ImageResponse> {
  return await invoke<ImageResponse>('set_random_image_by_index', { index });
}

export async function getCurrentFolder(): Promise<FolderInfo | null> {
  return await invoke('get_current_folder');
}

export async function deleteFolder(folderId: number): Promise<void> {
  await invoke('delete_folder', { folderId });
}

export async function hideNormalHistoryImage(imageId: number): Promise<void> {
  await invoke('hide_normal_history_image', { imageId });
}

export async function hideRandomHistoryImage(imageId: number): Promise<void> {
  await invoke('hide_random_history_image', { imageId });
}

export async function cleanupStaleFolders(): Promise<string[]> {
  return await invoke('cleanup_stale_folders');
}
