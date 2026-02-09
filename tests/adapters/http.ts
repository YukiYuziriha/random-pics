/**
 * HTTP Backend Adapter
 * 
 * Implements BackendAdapter using HTTP calls to the Bun backend server.
 * This is the adapter for Phase 0 (current implementation).
 */

import type { 
  BackendAdapter, 
  FolderInfo, 
  FolderHistory, 
  ImageHistory, 
  ImageState,
  ImageData 
} from '../types.ts';

const API_BASE = 'http://127.0.0.1:3000/api';

export class HttpBackendAdapter implements BackendAdapter {
  private baseUrl: string;
  
  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }
  
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/state`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }
  
  // Folder operations
  async pickFolder(path: string): Promise<FolderInfo> {
    const res = await fetch(`${this.baseUrl}/pick_folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    
    if (!res.ok) {
      throw new Error(`pickFolder failed: ${res.status} ${await res.text()}`);
    }
    
    return res.json();
  }
  
  async getNextFolder(): Promise<FolderInfo | null> {
    const res = await fetch(`${this.baseUrl}/next_folder`);
    
    if (res.status === 404) {
      return null;
    }
    
    if (!res.ok) {
      throw new Error(`getNextFolder failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  async getPrevFolder(): Promise<FolderInfo | null> {
    const res = await fetch(`${this.baseUrl}/prev_folder`);
    
    if (res.status === 404) {
      return null;
    }
    
    if (!res.ok) {
      throw new Error(`getPrevFolder failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  async getFolderHistory(): Promise<FolderHistory> {
    const res = await fetch(`${this.baseUrl}/folder_history`);
    
    if (!res.ok) {
      throw new Error(`getFolderHistory failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  async reindexCurrentFolder(): Promise<FolderInfo> {
    const res = await fetch(`${this.baseUrl}/reindex_current_folder`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      throw new Error(`reindexCurrentFolder failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  // Image traversal - Normal mode
  async getCurrentImage(): Promise<ImageData> {
    const res = await fetch(`${this.baseUrl}/current_image`);
    
    if (!res.ok) {
      throw new Error(`getCurrentImage failed: ${res.status}`);
    }
    
    return res.arrayBuffer();
  }
  
  async getNextImage(): Promise<ImageData> {
    const res = await fetch(`${this.baseUrl}/next`);
    
    if (!res.ok) {
      throw new Error(`getNextImage failed: ${res.status}`);
    }
    
    return res.arrayBuffer();
  }
  
  async getPrevImage(): Promise<ImageData> {
    const res = await fetch(`${this.baseUrl}/prev`);
    
    if (!res.ok) {
      throw new Error(`getPrevImage failed: ${res.status}`);
    }
    
    return res.arrayBuffer();
  }
  
  // Image traversal - Random mode
  async getNextRandomImage(): Promise<ImageData> {
    const res = await fetch(`${this.baseUrl}/next_random`);
    
    if (!res.ok) {
      throw new Error(`getNextRandomImage failed: ${res.status}`);
    }
    
    return res.arrayBuffer();
  }
  
  async getPrevRandomImage(): Promise<ImageData> {
    const res = await fetch(`${this.baseUrl}/prev_random`);
    
    if (!res.ok) {
      throw new Error(`getPrevRandomImage failed: ${res.status}`);
    }
    
    return res.arrayBuffer();
  }
  
  async getForceRandomImage(): Promise<ImageData> {
    const res = await fetch(`${this.baseUrl}/force_random`);
    
    if (!res.ok) {
      throw new Error(`getForceRandomImage failed: ${res.status}`);
    }
    
    return res.arrayBuffer();
  }
  
  // History operations
  async getNormalHistory(): Promise<ImageHistory> {
    const res = await fetch(`${this.baseUrl}/normal_history`);
    
    if (!res.ok) {
      throw new Error(`getNormalHistory failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  async getRandomHistory(): Promise<ImageHistory> {
    const res = await fetch(`${this.baseUrl}/random_history`);
    
    if (!res.ok) {
      throw new Error(`getRandomHistory failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  async resetNormalHistory(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/reset_normal_history`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      throw new Error(`resetNormalHistory failed: ${res.status}`);
    }
  }
  
  async resetRandomHistory(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/reset_random_history`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      throw new Error(`resetRandomHistory failed: ${res.status}`);
    }
  }
  
  // State operations
  async getImageState(): Promise<ImageState> {
    const res = await fetch(`${this.baseUrl}/state`);
    
    if (!res.ok) {
      throw new Error(`getImageState failed: ${res.status}`);
    }
    
    return res.json();
  }
  
  async setImageState(state: ImageState): Promise<void> {
    const res = await fetch(`${this.baseUrl}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    
    if (!res.ok) {
      throw new Error(`setImageState failed: ${res.status}`);
    }
  }
  
  // Destructive operations
  async fullWipe(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/full_wipe`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      throw new Error(`fullWipe failed: ${res.status}`);
    }
  }
}
