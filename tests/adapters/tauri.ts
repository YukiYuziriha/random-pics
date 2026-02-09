/**
 * Tauri Command Backend Adapter
 * 
 * Implements BackendAdapter using Tauri invoke calls.
 * This is the adapter for Phase 2 (Rust backend).
 */

import type { 
  BackendAdapter, 
  FolderInfo, 
  FolderHistory, 
  ImageHistory, 
  ImageState,
  ImageData 
} from '../types.ts';
import { invoke } from '@tauri-apps/api/core';

export class TauriCommandAdapter implements BackendAdapter {
  async isHealthy(): Promise<boolean> {
    try {
      return await invoke<boolean>('is_healthy');
    } catch {
      return false;
    }
  }
  
  // Folder operations
  async pickFolder(path: string): Promise<FolderInfo> {
    return await invoke('pick_folder', { path });
  }
  
  async getNextFolder(): Promise<FolderInfo | null> {
    return await invoke<FolderInfo | null>('next_folder');
  }
  
  async getPrevFolder(): Promise<FolderInfo | null> {
    return await invoke<FolderInfo | null>('prev_folder');
  }
  
  async getFolderHistory(): Promise<FolderHistory> {
    return await invoke('get_folder_history');
  }
  
  async reindexCurrentFolder(): Promise<FolderInfo> {
    return await invoke('reindex_current_folder');
  }
  
  // Image traversal - Normal mode
  async getCurrentImage(): Promise<ImageData> {
    const data = await invoke<number[]>('get_current_image');
    return new Uint8Array(data).buffer;
  }
  
  async getNextImage(): Promise<ImageData> {
    const data = await invoke<number[]>('get_next_image');
    return new Uint8Array(data).buffer;
  }
  
  async getPrevImage(): Promise<ImageData> {
    const data = await invoke<number[]>('get_prev_image');
    return new Uint8Array(data).buffer;
  }
  
  // Image traversal - Random mode
  async getNextRandomImage(): Promise<ImageData> {
    const data = await invoke<number[]>('get_next_random_image');
    return new Uint8Array(data).buffer;
  }
  
  async getPrevRandomImage(): Promise<ImageData> {
    const data = await invoke<number[]>('get_prev_random_image');
    return new Uint8Array(data).buffer;
  }
  
  async getForceRandomImage(): Promise<ImageData> {
    const data = await invoke<number[]>('get_force_random_image');
    return new Uint8Array(data).buffer;
  }
  
  // History operations
  async getNormalHistory(): Promise<ImageHistory> {
    return await invoke('get_normal_history');
  }
  
  async getRandomHistory(): Promise<ImageHistory> {
    return await invoke('get_random_history');
  }
  
  async resetNormalHistory(): Promise<void> {
    await invoke('reset_normal_history');
  }
  
  async resetRandomHistory(): Promise<void> {
    await invoke('reset_random_history');
  }
  
  // State operations
  async getImageState(): Promise<ImageState> {
    return await invoke('get_image_state');
  }
  
  async setImageState(state: ImageState): Promise<void> {
    await invoke('set_image_state', { state });
  }
  
  // Destructive operations
  async fullWipe(): Promise<void> {
    await invoke('full_wipe');
  }
}
