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
  history: string[];
  currentIndex: number;
};

export type FolderHistory = {
  history: string[];
  currentIndex: number;
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

// Image traversal - Normal mode
export async function getCurrentImage(): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_current_image');
  return new Uint8Array(data);
}

export async function getNextImage(): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_next_image');
  return new Uint8Array(data);
}

export async function getPrevImage(): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_prev_image');
  return new Uint8Array(data);
}

// Image traversal - Random mode
export async function getNextRandomImage(): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_next_random_image');
  return new Uint8Array(data);
}

export async function getPrevRandomImage(): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_prev_random_image');
  return new Uint8Array(data);
}

export async function getForceRandomImage(): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_force_random_image');
  return new Uint8Array(data);
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
